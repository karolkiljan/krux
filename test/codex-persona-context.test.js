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

test('KRUX_TURN_REMINDER=0 wycisza lekką kotwicę, pełna na progu zostaje', () => {
  const dir = tempDir();
  try {
    run({ hook_event_name: 'SessionStart', source: 'startup', session_id: 'sid-a' }, dir);
    const env = { KRUX_TURN_REMINDER: '0', KRUX_DRIFT_INTERVAL: '2' };
    const first = run({
      hook_event_name: 'UserPromptSubmit', prompt: 'pierwszy prompt',
      session_id: 'sid-a', turn_id: 'turn-1',
    }, dir, env);
    assert.equal(first.status, 0, first.stderr);
    assert.equal(first.stdout, '');
    const second = additionalContext(run({
      hook_event_name: 'UserPromptSubmit', prompt: 'drugi prompt',
      session_id: 'sid-a', turn_id: 'turn-2',
    }, dir, env), 'UserPromptSubmit');
    assert.match(second, /KRUX TURN — [\s\S]*4 PRAWA/);
    // Wyciszona tura zostaje zakotwiczona: PostToolUse nie przemyca
    // lekkiej kotwicy z powrotem po pierwszym narzędziu.
    run({
      hook_event_name: 'UserPromptSubmit', prompt: 'trzeci prompt',
      session_id: 'sid-a', turn_id: 'turn-3',
    }, dir, env);
    assert.equal(run({
      hook_event_name: 'PostToolUse', session_id: 'sid-a', turn_id: 'turn-3',
    }, dir, env).stdout, '');
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

test('PostToolUse kotwiczy automatyczną turę po pierwszym narzędziu', () => {
  const dir = tempDir();
  try {
    run({ hook_event_name: 'SessionStart', source: 'startup', session_id: 'sid-a' }, dir);
    const context = additionalContext(run({
      hook_event_name: 'PostToolUse', session_id: 'sid-a', turn_id: 'goal-turn',
    }, dir), 'PostToolUse');
    assert.match(context, /KRUX CONTINUATION/);
    assert.match(context, /Wzorzec Krux/);
    assert.equal(run({
      hook_event_name: 'PostToolUse', session_id: 'sid-a', turn_id: 'goal-turn',
    }, dir).stdout, '');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('regularna tura dostaje PostToolUse reminder co skonfigurowany interwał', () => {
  const dir = tempDir();
  try {
    run({ hook_event_name: 'SessionStart', source: 'startup', session_id: 'sid-a' }, dir);
    run({
      hook_event_name: 'UserPromptSubmit', prompt: 'napraw test',
      session_id: 'sid-a', turn_id: 'turn-a',
    }, dir);
    for (let n = 1; n < 4; n += 1) {
      assert.equal(run({
        hook_event_name: 'PostToolUse', session_id: 'sid-a', turn_id: 'turn-a',
      }, dir, { KRUX_CODEX_TOOL_INTERVAL: '4' }).stdout, '', `tool ${n}`);
    }
    const context = additionalContext(run({
      hook_event_name: 'PostToolUse', session_id: 'sid-a', turn_id: 'turn-a',
    }, dir, { KRUX_CODEX_TOOL_INTERVAL: '4' }), 'PostToolUse');
    assert.match(context, /KRUX CONTINUATION/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('PostToolUse jest cichy dla nieaktywnej sesji i braku turn_id', () => {
  const dir = tempDir();
  try {
    assert.equal(run({
      hook_event_name: 'PostToolUse', session_id: 'sid-a', turn_id: 'turn-a',
    }, dir).stdout, '');
    run({ hook_event_name: 'SessionStart', source: 'startup', session_id: 'sid-a' }, dir);
    assert.equal(run({ hook_event_name: 'PostToolUse', session_id: 'sid-a' }, dir).stdout, '');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('brak session_id nie tworzy globalnej aktywnej sesji ani późniejszych reminderów', () => {
  const dir = tempDir();
  try {
    const start = run({ hook_event_name: 'SessionStart', source: 'startup' }, dir);
    assert.match(additionalContext(start, 'SessionStart'), /KRUX PERSONA ACTIVE/);
    assert.equal(fs.existsSync(path.join(dir, '.krux-active-sessions')), false);
    assert.equal(run({
      hook_event_name: 'UserPromptSubmit', prompt: 'zwykły prompt', turn_id: 'turn-a',
    }, dir).stdout, '');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
