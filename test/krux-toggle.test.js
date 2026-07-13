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

function buildPayload(prompt) {
  return JSON.stringify({ prompt });
}

function buildEnv(home, extraEnv = {}) {
  // Strip ambient KRUX_*/PLUGIN_DATA so a developer's shell can't leak into
  // deterministic env-driven assertions (e.g. KRUX_DRIFT_INTERVAL below).
  const cleanEnv = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (!k.startsWith('KRUX_') && k !== 'PLUGIN_DATA') cleanEnv[k] = v;
  }
  return { ...cleanEnv, HOME: home, ...extraEnv };
}

function runHook(home, prompt, extraEnv = {}) {
  const result = spawnSync('node', [HOOK], {
    input: buildPayload(prompt),
    env: buildEnv(home, extraEnv),
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

function additionalContext(result) {
  return result.stdout ? JSON.parse(result.stdout).hookSpecificOutput.additionalContext : '';
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
    assert.match(additionalContext(r), /PRAWO 1/);
  });
});

test('slash /krux:krux aktywuje runtime bez nadpisania trwałego mode', () => {
  withTempHome(home => {
    fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
    fs.writeFileSync(path.join(home, '.claude', '.krux-mode'), 'off');
    const r = runHook(home, '/krux:krux');
    assert.equal(r.status, 0);
    assert.equal(readMode(home), 'off');
    assert.equal(hasActive(home), true);
  });
});

test('Codex $krux:krux aktywuje runtime bez nadpisania trwałego mode', () => {
  withTempHome(home => {
    fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
    fs.writeFileSync(path.join(home, '.claude', '.krux-mode'), 'off');
    const r = runHook(home, '$krux:krux');
    assert.equal(r.status, 0);
    assert.equal(readMode(home), 'off');
    assert.equal(hasActive(home), true);
  });
});

test('Codex $krux:krux on/off przełącza trwały mode', () => {
  withTempHome(home => {
    const on = runHook(home, '$krux:krux on');
    assert.equal(on.status, 0);
    assert.equal(readMode(home), 'on');
    assert.equal(hasActive(home), true);

    const off = runHook(home, '$krux:krux off');
    assert.equal(off.status, 0);
    assert.equal(readMode(home), 'off');
    assert.equal(hasActive(home), false);
  });
});

test('"stop krux" turns mode OFF and removes active flag', () => {
  withTempHome(home => {
    runHook(home, 'krux');
    const r = runHook(home, 'stop krux');
    assert.equal(r.status, 0);
    assert.equal(readMode(home), 'off');
    assert.equal(hasActive(home), false);
    assert.match(additionalContext(r), /KRUX PERSONA OFF/);
    assert.match(additionalContext(r), /Flow zachowuje własny, niezależny stan/);
  });
});

test('ON aliases: diacritics, ASCII fallback, "start krux", "aktywuj krux"', () => {
  for (const phrase of ['włącz krux', 'wlacz krux', 'start krux', 'aktywuj krux']) {
    withTempHome(home => {
      const r = runHook(home, phrase);
      assert.equal(r.status, 0, `phrase=${phrase} should exit 0`);
      assert.equal(readMode(home), 'on', `phrase=${phrase} should turn mode on`);
    });
  }
});

test('OFF aliases: "wyłącz krux", "normalny tryb"', () => {
  for (const phrase of ['wyłącz krux', 'normalny tryb']) {
    withTempHome(home => {
      runHook(home, 'krux');
      const r = runHook(home, phrase);
      assert.equal(r.status, 0, `phrase=${phrase} should exit 0`);
      assert.equal(readMode(home), 'off', `phrase=${phrase} should turn mode off`);
    });
  }
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

test('normalization: trim whitespace and case insensitivity are tolerated', () => {
  for (const phrase of ['  krux  ', 'KRUX']) {
    withTempHome(home => {
      runHook(home, phrase);
      assert.equal(readMode(home), 'on', `phrase=${JSON.stringify(phrase)} should turn mode on`);
    });
  }
});

test('malformed stdin: hook exits cleanly', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'krux-test-'));
  try {
    const r = spawnSync('node', [HOOK], {
      input: 'not-json',
      env: buildEnv(home),
      encoding: 'utf8',
      timeout: 5000,
    });
    assert.equal(r.status, 0);
    assert.equal(readMode(home), null);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('PLUGIN_DATA ustawione: "krux" pisze stan pod PLUGIN_DATA, nie pod ~/.claude', () => {
  withTempHome(home => {
    const pluginData = fs.mkdtempSync(path.join(os.tmpdir(), 'krux-plugin-data-'));
    try {
      const r = runHook(home, 'krux', { PLUGIN_DATA: pluginData });
      assert.equal(r.status, 0);
      assert.equal(fs.readFileSync(path.join(pluginData, '.krux-mode'), 'utf8'), 'on');
      assert.equal(fs.existsSync(path.join(home, '.claude', '.krux-mode')), false);
    } finally {
      fs.rmSync(pluginData, { recursive: true, force: true });
    }
  });
});

test('persona ON nie potwierdza trwałego włączenia, gdy mode jest niezapisywalny', () => {
  withTempHome(home => {
    const pluginData = fs.mkdtempSync(path.join(os.tmpdir(), 'krux-plugin-data-'));
    try {
      fs.mkdirSync(path.join(pluginData, '.krux-mode'));

      const r = runHook(home, 'krux', { PLUGIN_DATA: pluginData });

      assert.equal(r.status, 0);
      assert.equal(r.stdout, '');
      assert.match(r.stderr, /write \.krux-mode failed/);
      assert.equal(fs.existsSync(path.join(pluginData, '.krux-active')), false);
    } finally {
      fs.rmSync(pluginData, { recursive: true, force: true });
    }
  });
});

test('persona OFF nie potwierdza trwałego wyłączenia, gdy mode jest niezapisywalny', () => {
  withTempHome(home => {
    const pluginData = fs.mkdtempSync(path.join(os.tmpdir(), 'krux-plugin-data-'));
    try {
      fs.mkdirSync(path.join(pluginData, '.krux-mode'));
      fs.closeSync(fs.openSync(path.join(pluginData, '.krux-active'), 'w'));

      const r = runHook(home, 'stop krux', { PLUGIN_DATA: pluginData });

      assert.equal(r.status, 0);
      assert.equal(r.stdout, '');
      assert.match(r.stderr, /write \.krux-mode failed/);
      assert.equal(fs.existsSync(path.join(pluginData, '.krux-active')), true);
    } finally {
      fs.rmSync(pluginData, { recursive: true, force: true });
    }
  });
});

// --- drift-guard: periodic reminder while persona active on unrelated turns ---

function turnCountFile(home) {
  return path.join(home, '.claude', '.krux-turn-count');
}

test('drift-guard: zwykły prompt poniżej progu nie emituje nic (cisza jak dziś)', () => {
  withTempHome(home => {
    const env = { KRUX_DRIFT_INTERVAL: '5' };
    runHook(home, 'krux', env);
    const r = runHook(home, 'explain this code', env);
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '');
  });
});

test('drift-guard: persona nieaktywna → zwykły prompt nic nie robi, brak pliku licznika', () => {
  withTempHome(home => {
    const r = runHook(home, 'explain this code', { KRUX_DRIFT_INTERVAL: '2' });
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '');
    assert.equal(fs.existsSync(turnCountFile(home)), false);
  });
});

test('drift-guard: po KRUX_DRIFT_INTERVAL turach emituje KRUX DRIFT-GUARD i resetuje licznik', () => {
  withTempHome(home => {
    const env = { KRUX_DRIFT_INTERVAL: '3' };
    runHook(home, 'krux', env);
    assert.equal(runHook(home, 'turn 1', env).stdout, '');
    assert.equal(runHook(home, 'turn 2', env).stdout, '');
    const r = runHook(home, 'turn 3', env);
    assert.match(additionalContext(r), /KRUX DRIFT-GUARD/);
    assert.match(additionalContext(r), /examples\.md/);
    assert.equal(fs.existsSync(turnCountFile(home)), false, 'licznik zresetowany po przypomnieniu');
  });
});

test('drift-guard: jawne włączenie ("krux") resetuje licznik turnów', () => {
  withTempHome(home => {
    const env = { KRUX_DRIFT_INTERVAL: '3' };
    runHook(home, 'krux', env);
    runHook(home, 'turn 1', env);
    runHook(home, 'turn 2', env);
    assert.equal(fs.readFileSync(turnCountFile(home), 'utf8'), '2');
    runHook(home, 'krux', env);
    assert.equal(fs.existsSync(turnCountFile(home)), false, 'jawne ON czyści licznik');
  });
});

test('drift-guard: jawne wyłączenie ("stop krux") czyści plik licznika', () => {
  withTempHome(home => {
    const env = { KRUX_DRIFT_INTERVAL: '5' };
    runHook(home, 'krux', env);
    runHook(home, 'turn 1', env);
    assert.equal(fs.existsSync(turnCountFile(home)), true);
    runHook(home, 'stop krux', env);
    assert.equal(fs.existsSync(turnCountFile(home)), false, 'OFF czyści licznik');
  });
});
