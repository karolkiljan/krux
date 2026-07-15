const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { markSessionActive, markPromptTurn } = require('../hooks/lib/drift-guard');
const { FINAL_GUARD_REASON, decisionForPayload } = require('../hooks/codex/persona-stop');

const STOP_HOOK = path.join(__dirname, '..', 'hooks', 'codex', 'persona-stop.js');

function makeDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'krux-codex-stop-'));
}

function activeDir(sid = 'sid-a', turnId = 'turn-a', strict = false) {
  const dir = makeDir();
  markSessionActive(dir, sid);
  if (turnId) markPromptTurn(dir, sid, turnId, { strict });
  return dir;
}

function neutralPayload() {
  return {
    hook_event_name: 'Stop',
    session_id: 'sid-a',
    turn_id: 'turn-a',
    stop_hook_active: false,
    last_assistant_message: 'Dokumentacja została zaktualizowana. Build przechodzi.',
  };
}

function cleanEnvironment(extra = {}) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith('KRUX_') || key === 'PLUGIN_DATA' || key.startsWith('CLAUDE_PLUGIN_')) {
      delete env[key];
    }
  }
  return { ...env, ...extra };
}

function runStop(dir, payload, extraEnv = {}) {
  return spawnSync('node', [STOP_HOOK], {
    input: typeof payload === 'string' ? payload : JSON.stringify(payload),
    encoding: 'utf8',
    env: cleanEnvironment(dir ? { PLUGIN_DATA: dir, ...extraEnv } : extraEnv),
    timeout: 5000,
  });
}

test('aktywny neutralny finał blokuje Stop dokładnie raz', () => {
  const dir = activeDir();
  try {
    const first = runStop(dir, neutralPayload());
    assert.equal(first.status, 0, first.stderr);
    assert.deepEqual(JSON.parse(first.stdout), {
      decision: 'block',
      reason: FINAL_GUARD_REASON,
    });

    const second = runStop(dir, {
      ...neutralPayload(),
      stop_hook_active: true,
      last_assistant_message: 'Nadal neutralnie.',
    });
    assert.equal(second.status, 0, second.stderr);
    assert.equal(second.stdout, '');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('off, głos Krux i ścisły turn przechodzą bez outputu', () => {
  const inactive = makeDir();
  const active = activeDir();
  const strict = activeDir('sid-a', 'turn-a', true);
  try {
    assert.equal(runStop(inactive, neutralPayload()).stdout, '');
    assert.equal(runStop(active, {
      ...neutralPayload(),
      last_assistant_message: 'Cache pusty → baza paść. Robak wynocha.',
    }).stdout, '');
    assert.equal(runStop(strict, neutralPayload()).stdout, '');
  } finally {
    for (const dir of [inactive, active, strict]) fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('JSON, code-only i Conventional Commit przechodzą bez korekty', () => {
  const dir = activeDir();
  try {
    for (const last_assistant_message of [
      '{"status":"ok"}',
      '```js\nexport const ok = true;\n```',
      'fix(parser): reject invalid dates',
    ]) {
      assert.equal(runStop(dir, { ...neutralPayload(), last_assistant_message }).stdout, '');
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('KRUX_FINAL_GUARD=0 wyłącza wyłącznie final guard', () => {
  const dir = activeDir();
  try {
    assert.equal(runStop(dir, neutralPayload(), { KRUX_FINAL_GUARD: '0' }).stdout, '');
    assert.equal(runStop(dir, neutralPayload(), { KRUX_FINAL_GUARD: 'off' }).stdout, '');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('malformed stdin, brak PLUGIN_DATA i obcy event kończą się cicho', () => {
  const dir = activeDir();
  try {
    for (const result of [
      runStop(dir, '{'),
      runStop(null, neutralPayload()),
      runStop(dir, { ...neutralPayload(), hook_event_name: 'PostToolUse' }),
    ]) {
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout, '');
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('czysta decyzja odrzuca brak session_id', () => {
  const dir = activeDir();
  try {
    assert.equal(decisionForPayload({ ...neutralPayload(), session_id: undefined }, dir, {}), null);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
