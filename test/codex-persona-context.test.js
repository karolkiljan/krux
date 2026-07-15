const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const HOOK = path.join(__dirname, '..', 'hooks', 'codex', 'persona-context.js');

function cleanEnvironment(extra = {}) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith('KRUX_') || key === 'PLUGIN_DATA' || key.startsWith('CLAUDE_PLUGIN_')) {
      delete env[key];
    }
  }
  return { ...env, ...extra };
}

function run(payload, dir, extraEnv = {}) {
  return spawnSync('node', [HOOK], {
    input: typeof payload === 'string' ? payload : JSON.stringify(payload),
    env: cleanEnvironment(dir ? { PLUGIN_DATA: dir, ...extraEnv } : extraEnv),
    encoding: 'utf8',
    timeout: 5000,
  });
}

function additionalContext(result, event) {
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout).hookSpecificOutput;
  assert.equal(output.hookEventName, event);
  return output.additionalContext;
}

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'krux-codex-persona-'));
}

test('SessionStart startup aktywuje sesję i emituje pełną kotwicę Codexa', () => {
  const dir = tempDir();
  try {
    const context = additionalContext(run({
      hook_event_name: 'SessionStart', source: 'startup', session_id: 'sid-a',
    }, dir), 'SessionStart');
    assert.match(context, /KRUX PERSONA ACTIVE[\s\S]*## Persona/);
    assert.match(fs.readFileSync(path.join(dir, '.krux-active-sessions'), 'utf8'), /sid-a/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('clear i compact reinjectują skill, resume daje pełną zwartą kotwicę', () => {
  for (const source of ['clear', 'resume', 'compact']) {
    const dir = tempDir();
    try {
      const context = additionalContext(run({
        hook_event_name: 'SessionStart', source, session_id: `sid-${source}`,
      }, dir), 'SessionStart');
      if (source === 'resume') {
        assert.match(context, /4 PRAWA/);
        assert.doesNotMatch(context, /## Persona/);
      } else {
        assert.match(context, /## Persona/);
      }
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  }
});

test('SessionStart z trwałym off nie aktywuje ani nie emituje', () => {
  const dir = tempDir();
  try {
    fs.writeFileSync(path.join(dir, '.krux-mode'), 'off');
    const result = run({ hook_event_name: 'SessionStart', source: 'startup', session_id: 'sid-a' }, dir);
    assert.equal(result.status, 0);
    assert.equal(result.stdout, '');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('UserPromptSubmit emituje lekki reminder, a na progu pełny', () => {
  const dir = tempDir();
  try {
    run({ hook_event_name: 'SessionStart', source: 'startup', session_id: 'sid-a' }, dir);
    const first = additionalContext(run({
      hook_event_name: 'UserPromptSubmit', prompt: 'pierwszy prompt', session_id: 'sid-a',
    }, dir, { KRUX_DRIFT_INTERVAL: '2' }), 'UserPromptSubmit');
    assert.doesNotMatch(first, /4 PRAWA/);
    const second = additionalContext(run({
      hook_event_name: 'UserPromptSubmit', prompt: 'drugi prompt', session_id: 'sid-a',
    }, dir, { KRUX_DRIFT_INTERVAL: '2' }), 'UserPromptSubmit');
    assert.match(second, /4 PRAWA/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('jawne off czyści bieżącą sesję i emituje neutralny kontrakt', () => {
  const dir = tempDir();
  try {
    run({ hook_event_name: 'SessionStart', source: 'startup', session_id: 'sid-a' }, dir);
    const context = additionalContext(run({
      hook_event_name: 'UserPromptSubmit', prompt: 'wyłącz krux', session_id: 'sid-a',
    }, dir), 'UserPromptSubmit');
    assert.match(context, /KRUX PERSONA OFF/);
    assert.equal(fs.readFileSync(path.join(dir, '.krux-mode'), 'utf8'), 'off');
    assert.doesNotMatch(fs.readFileSync(path.join(dir, '.krux-active-sessions'), 'utf8'), /sid-a/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('jawne on zapisuje mode i natychmiast emituje pełną kotwicę', () => {
  const dir = tempDir();
  try {
    fs.writeFileSync(path.join(dir, '.krux-mode'), 'off');
    const context = additionalContext(run({
      hook_event_name: 'UserPromptSubmit', prompt: 'włącz krux', session_id: 'sid-a',
    }, dir), 'UserPromptSubmit');
    assert.match(context, /KRUX PERSONA ACTIVE.*4 PRAWA/s);
    assert.equal(fs.readFileSync(path.join(dir, '.krux-mode'), 'utf8'), 'on');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('one-shot aktywuje tylko sesję bez nadpisania trwałego off', () => {
  const dir = tempDir();
  try {
    fs.writeFileSync(path.join(dir, '.krux-mode'), 'off');
    const context = additionalContext(run({
      hook_event_name: 'UserPromptSubmit', prompt: '$krux:krux', session_id: 'sid-a',
    }, dir), 'UserPromptSubmit');
    assert.match(context, /KRUX PERSONA ACTIVE/);
    assert.equal(fs.readFileSync(path.join(dir, '.krux-mode'), 'utf8'), 'off');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('SubagentStart dziedziczy personę tylko z aktywnej sesji rodzica', () => {
  const dir = tempDir();
  try {
    assert.equal(run({ hook_event_name: 'SubagentStart', session_id: 'sid-a' }, dir).stdout, '');
    run({ hook_event_name: 'SessionStart', source: 'startup', session_id: 'sid-a' }, dir);
    const context = additionalContext(
      run({ hook_event_name: 'SubagentStart', session_id: 'sid-a' }, dir),
      'SubagentStart',
    );
    assert.match(context, /KRUX PERSONA ACTIVE.*4 PRAWA/s);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('malformed stdin, brak PLUGIN_DATA i obcy event kończą się cichym sukcesem', () => {
  const dir = tempDir();
  try {
    for (const result of [
      run('{', dir),
      run({ hook_event_name: 'SessionStart', source: 'startup' }),
      run({ hook_event_name: 'PreToolUse', session_id: 'sid-a' }, dir),
    ]) {
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout, '');
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('natywny adapter ignoruje CLAUDE_PLUGIN_DATA bez PLUGIN_DATA', () => {
  const dir = tempDir();
  try {
    const result = run(
      { hook_event_name: 'SessionStart', source: 'startup', session_id: 'sid-a' },
      null,
      { CLAUDE_PLUGIN_DATA: dir },
    );
    assert.equal(result.status, 0);
    assert.equal(result.stdout, '');
    assert.deepEqual(fs.readdirSync(dir), []);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
