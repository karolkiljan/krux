// Tests for hooks/krux-konkret-toggle.js — UserPromptSubmit konkret toggle.
// Strategy: spawn hook with isolated HOME, feed prompt, assert flag + emitted JSON.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const HOOK = path.join(__dirname, '..', 'hooks', 'krux-konkret-toggle.js');

function withTempHome(fn) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'krux-konkret-test-'));
  try { fn(home); } finally { fs.rmSync(home, { recursive: true, force: true }); }
}

function buildEnv(home, extraEnv = {}) {
  const env = { ...process.env, HOME: home, ...extraEnv };
  for (const k of Object.keys(env)) {
    if (k.startsWith('KRUX_') && !(k in extraEnv)) delete env[k];
  }
  if (!('PLUGIN_DATA' in extraEnv)) delete env.PLUGIN_DATA;
  return env;
}

function runHook(home, prompt, extraEnv = {}) {
  return spawnSync('node', [HOOK], {
    input: JSON.stringify({ prompt }),
    env: buildEnv(home, extraEnv),
    encoding: 'utf8',
    timeout: 5000,
  });
}

function hasFlag(home) {
  return fs.existsSync(path.join(home, '.claude', '.krux-konkret-active'));
}

function parseEmitted(stdout) {
  if (!stdout) return null;
  try { return JSON.parse(stdout); } catch { return null; }
}

test('"konkret" włącza tryb i emituje kontekst aktywacji', () => {
  withTempHome(home => {
    const r = runHook(home, 'konkret');
    assert.equal(r.status, 0);
    assert.equal(hasFlag(home), true);
    const out = parseEmitted(r.stdout);
    assert.ok(out, 'hook must emit JSON');
    assert.equal(out.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
    assert.match(out.hookSpecificOutput.additionalContext, /KRUX-KONKRET ON/);
  });
});

test('"konkret off" wyłącza tryb', () => {
  withTempHome(home => {
    runHook(home, 'konkret');
    assert.equal(hasFlag(home), true);
    const r = runHook(home, 'konkret off');
    assert.equal(r.status, 0);
    assert.equal(hasFlag(home), false);
    const out = parseEmitted(r.stdout);
    assert.match(out.hookSpecificOutput.additionalContext, /KRUX-KONKRET OFF/);
  });
});

test('aliasy ON: strict, krux-konkret, slash/dollar z argumentem', () => {
  for (const phrase of [
    'konkret on',
    'strict',
    'strict on',
    'krux-konkret',
    'krux-konkret on',
    '/krux:krux-konkret',
    '/krux:krux-konkret on',
    '/krux:krux-konkret napraw parser',
    '$krux:krux-konkret',
    '$krux:krux-konkret on',
    '$krux:krux-konkret napraw parser',
  ]) {
    withTempHome(home => {
      const r = runHook(home, phrase);
      assert.equal(r.status, 0, `phrase=${phrase} should exit 0`);
      assert.equal(hasFlag(home), true, `phrase=${phrase} should set flag`);
    });
  }
});

test('aliasy OFF: stop konkret, koniec konkret, strict off', () => {
  for (const phrase of [
    'stop konkret',
    'koniec konkret',
    'strict off',
    'krux-konkret off',
    '/krux:krux-konkret off',
    '$krux:krux-konkret off',
  ]) {
    withTempHome(home => {
      runHook(home, 'konkret');
      const r = runHook(home, phrase);
      assert.equal(r.status, 0);
      assert.equal(hasFlag(home), false, `phrase=${phrase} should remove flag`);
    });
  }
});

test('flaga aktywna → reminder per-turn na niepowiązanym prompt', () => {
  withTempHome(home => {
    runHook(home, 'konkret');
    const r = runHook(home, 'dodaj walidację do formularza');
    assert.equal(r.status, 0);
    const out = parseEmitted(r.stdout);
    assert.ok(out, 'reminder JSON expected when flag active');
    assert.match(out.hookSpecificOutput.additionalContext, /KRUX-KONKRET aktywny/);
    assert.equal(hasFlag(home), true, 'unrelated prompt must not clear flag');
  });
});

test('flaga nieaktywna → niepowiązany prompt bez emisji', () => {
  withTempHome(home => {
    const r = runHook(home, 'dodaj walidację do formularza');
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '', 'no emission when konkret inactive');
    assert.equal(hasFlag(home), false);
  });
});

test('słowo "konkret" w środku zdania NIE togguje (full-match only)', () => {
  withTempHome(home => {
    const r = runHook(home, 'daj mi konkret w tej sprawie');
    assert.equal(r.status, 0);
    assert.equal(hasFlag(home), false, 'partial match must not enable mode');
  });
});

test('malformed stdin wychodzi czysto bez tworzenia flagi', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'krux-konkret-test-'));
  try {
    const r = spawnSync('node', [HOOK], {
      input: 'not-json',
      env: buildEnv(home),
      encoding: 'utf8',
      timeout: 5000,
    });
    assert.equal(r.status, 0);
    assert.equal(hasFlag(home), false);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('case insensitive: "KONKRET" działa', () => {
  withTempHome(home => {
    runHook(home, 'KONKRET');
    assert.equal(hasFlag(home), true);
  });
});

test('PLUGIN_DATA ustawione: flaga pod PLUGIN_DATA, nie pod ~/.claude', () => {
  withTempHome(home => {
    const pluginData = fs.mkdtempSync(path.join(os.tmpdir(), 'krux-plugin-data-'));
    try {
      const r = runHook(home, 'konkret', { PLUGIN_DATA: pluginData });
      assert.equal(r.status, 0);
      assert.equal(fs.existsSync(path.join(pluginData, '.krux-konkret-active')), true);
      assert.equal(fs.existsSync(path.join(home, '.claude', '.krux-konkret-active')), false);
    } finally {
      fs.rmSync(pluginData, { recursive: true, force: true });
    }
  });
});

test('ON nie potwierdza aktywacji, gdy katalog stanu niedostępny', () => {
  withTempHome(home => {
    const blocked = path.join(home, 'not-a-directory');
    fs.writeFileSync(blocked, 'x');

    const r = runHook(home, 'konkret', { PLUGIN_DATA: blocked });

    assert.equal(r.status, 0);
    assert.equal(r.stdout, '');
    assert.match(r.stderr, /state directory creation failed/);
  });
});

test('OFF nie potwierdza wyłączenia, gdy flagi nie da się usunąć', () => {
  withTempHome(home => {
    const pluginData = fs.mkdtempSync(path.join(os.tmpdir(), 'krux-plugin-data-'));
    try {
      fs.mkdirSync(path.join(pluginData, '.krux-konkret-active'));

      const r = runHook(home, 'konkret off', { PLUGIN_DATA: pluginData });

      assert.equal(r.status, 0);
      assert.equal(r.stdout, '');
      assert.match(r.stderr, /flag removal failed/);
      assert.equal(fs.existsSync(path.join(pluginData, '.krux-konkret-active')), true);
    } finally {
      fs.rmSync(pluginData, { recursive: true, force: true });
    }
  });
});
