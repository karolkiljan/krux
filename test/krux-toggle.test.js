// Tests for hooks/krux-toggle.js — UserPromptSubmit toggle.
// Strategy: spawn hook as child process with isolated HOME, feed JSON on stdin,
// assert state of ~/.claude/.krux-mode and ~/.claude/.krux-active afterwards.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const HOOK = path.join(__dirname, '..', 'hooks', 'krux-toggle.js');

function withTempHome(fn) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'krux-test-'));
  try { fn(home); } finally { fs.rmSync(home, { recursive: true, force: true }); }
}

function runHook(home, prompt) {
  const result = spawnSync('node', [HOOK], {
    input: JSON.stringify({ prompt }),
    env: { ...process.env, HOME: home, USERPROFILE: home },
    encoding: 'utf8',
    timeout: 5000,
  });
  return result;
}

function readMode(home) {
  try { return fs.readFileSync(path.join(home, '.claude', '.krux-mode'), 'utf8'); }
  catch { return null; }
}

function hasActive(home) {
  return fs.existsSync(path.join(home, '.claude', '.krux-active'));
}

test('ignores empty prompt', () => {
  withTempHome(home => {
    const r = runHook(home, '');
    assert.equal(r.status, 0);
    assert.equal(readMode(home), null);
    assert.equal(hasActive(home), false);
  });
});

test('"krux" turns mode ON and creates active flag', () => {
  withTempHome(home => {
    const r = runHook(home, 'krux');
    assert.equal(r.status, 0);
    assert.equal(readMode(home), 'on');
    assert.equal(hasActive(home), true);
  });
});

test('"stop krux" turns mode OFF and removes active flag', () => {
  withTempHome(home => {
    runHook(home, 'krux');
    const r = runHook(home, 'stop krux');
    assert.equal(r.status, 0);
    assert.equal(readMode(home), 'off');
    assert.equal(hasActive(home), false);
  });
});

test('Polish diacritics: "włącz krux" works', () => {
  withTempHome(home => {
    const r = runHook(home, 'włącz krux');
    assert.equal(r.status, 0);
    assert.equal(readMode(home), 'on');
  });
});

test('ASCII fallback: "wlacz krux" works (no diacritics)', () => {
  withTempHome(home => {
    const r = runHook(home, 'wlacz krux');
    assert.equal(r.status, 0);
    assert.equal(readMode(home), 'on');
  });
});

test('"wyłącz krux" turns OFF', () => {
  withTempHome(home => {
    runHook(home, 'krux');
    const r = runHook(home, 'wyłącz krux');
    assert.equal(r.status, 0);
    assert.equal(readMode(home), 'off');
  });
});

test('"normalny tryb" turns OFF', () => {
  withTempHome(home => {
    runHook(home, 'krux');
    const r = runHook(home, 'normalny tryb');
    assert.equal(r.status, 0);
    assert.equal(readMode(home), 'off');
  });
});

test('aliases: "start krux", "aktywuj krux"', () => {
  withTempHome(home => {
    const r = runHook(home, 'start krux');
    assert.equal(r.status, 0);
    assert.equal(readMode(home), 'on');
  });
  withTempHome(home => {
    const r = runHook(home, 'aktywuj krux');
    assert.equal(r.status, 0);
    assert.equal(readMode(home), 'on');
  });
});

test('unrelated prompt does not change state', () => {
  withTempHome(home => {
    runHook(home, 'krux');
    runHook(home, 'explain this code');
    assert.equal(readMode(home), 'on');
    assert.equal(hasActive(home), true);
  });
});

test('prompt with extra words does NOT trigger (full-message match only)', () => {
  withTempHome(home => {
    runHook(home, 'hey krux please help');
    assert.equal(readMode(home), null);
    assert.equal(hasActive(home), false);
  });
});

test('trim: surrounding whitespace is tolerated', () => {
  withTempHome(home => {
    runHook(home, '  krux  ');
    assert.equal(readMode(home), 'on');
  });
});

test('case insensitive: "KRUX" works', () => {
  withTempHome(home => {
    runHook(home, 'KRUX');
    assert.equal(readMode(home), 'on');
  });
});

test('malformed stdin: hook exits cleanly', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'krux-test-'));
  try {
    const r = spawnSync('node', [HOOK], {
      input: 'not-json',
      env: { ...process.env, HOME: home, USERPROFILE: home },
      encoding: 'utf8',
      timeout: 5000,
    });
    assert.equal(r.status, 0);
    assert.equal(readMode(home), null);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});
