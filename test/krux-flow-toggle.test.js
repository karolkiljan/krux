// Tests for hooks/krux-flow-toggle.js — UserPromptSubmit flow toggle.
// Strategy: spawn hook with isolated HOME, feed prompt, assert flag + emitted JSON.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const HOOK = path.join(__dirname, '..', 'hooks', 'krux-flow-toggle.js');

function withTempHome(fn) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'krux-flow-test-'));
  try { fn(home); } finally { fs.rmSync(home, { recursive: true, force: true }); }
}

function runHook(home, prompt) {
  return spawnSync('node', [HOOK], {
    input: JSON.stringify({ prompt }),
    env: { ...process.env, HOME: home, USERPROFILE: home },
    encoding: 'utf8',
    timeout: 5000,
  });
}

function hasFlag(home) {
  return fs.existsSync(path.join(home, '.claude', '.krux-flow-active'));
}

function parseEmitted(stdout) {
  if (!stdout) return null;
  try { return JSON.parse(stdout); } catch { return null; }
}

test('"flow" enables flow mode and emits activation context', () => {
  withTempHome(home => {
    const r = runHook(home, 'flow');
    assert.equal(r.status, 0);
    assert.equal(hasFlag(home), true);
    const out = parseEmitted(r.stdout);
    assert.ok(out, 'hook must emit JSON');
    assert.equal(out.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
    assert.match(out.hookSpecificOutput.additionalContext, /KRUX-FLOW ON/);
  });
});

test('"flow off" disables flow mode', () => {
  withTempHome(home => {
    runHook(home, 'flow');
    assert.equal(hasFlag(home), true);
    const r = runHook(home, 'flow off');
    assert.equal(r.status, 0);
    assert.equal(hasFlag(home), false);
    const out = parseEmitted(r.stdout);
    assert.match(out.hookSpecificOutput.additionalContext, /KRUX-FLOW OFF/);
  });
});

test('aliases: "iterate", "tryb krokowy", "krux-flow"', () => {
  for (const phrase of ['iterate', 'tryb krokowy', 'krux-flow', 'krux-flow on', 'flow on']) {
    withTempHome(home => {
      const r = runHook(home, phrase);
      assert.equal(r.status, 0, `phrase=${phrase} should exit 0`);
      assert.equal(hasFlag(home), true, `phrase=${phrase} should set flag`);
    });
  }
});

test('off aliases: "stop flow", "koniec flow", "krux-flow off"', () => {
  for (const phrase of ['stop flow', 'koniec flow', 'krux-flow off']) {
    withTempHome(home => {
      runHook(home, 'flow');
      const r = runHook(home, phrase);
      assert.equal(r.status, 0);
      assert.equal(hasFlag(home), false, `phrase=${phrase} should remove flag`);
    });
  }
});

test('when flag active, per-turn reminder is emitted on unrelated prompts', () => {
  withTempHome(home => {
    runHook(home, 'flow');
    const r = runHook(home, 'refactor this function');
    assert.equal(r.status, 0);
    const out = parseEmitted(r.stdout);
    assert.ok(out, 'reminder JSON expected when flag active');
    assert.match(out.hookSpecificOutput.additionalContext, /KRUX-FLOW aktywny/);
    assert.equal(hasFlag(home), true, 'unrelated prompt must not clear flag');
  });
});

test('when flag inactive, unrelated prompt produces no output', () => {
  withTempHome(home => {
    const r = runHook(home, 'refactor this function');
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '', 'no emission when flow inactive');
    assert.equal(hasFlag(home), false);
  });
});

test('malformed stdin exits cleanly without creating flag', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'krux-flow-test-'));
  try {
    const r = spawnSync('node', [HOOK], {
      input: 'not-json',
      env: { ...process.env, HOME: home, USERPROFILE: home },
      encoding: 'utf8',
      timeout: 5000,
    });
    assert.equal(r.status, 0);
    assert.equal(hasFlag(home), false);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('case insensitive: "FLOW" works', () => {
  withTempHome(home => {
    runHook(home, 'FLOW');
    assert.equal(hasFlag(home), true);
  });
});
