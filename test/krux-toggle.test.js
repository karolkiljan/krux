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

function buildPayload(prompt, sessionId) {
  return JSON.stringify(sessionId ? { prompt, session_id: sessionId } : { prompt });
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

function runHook(home, prompt, extraEnv = {}, sessionId) {
  const result = spawnSync('node', [HOOK], {
    input: buildPayload(prompt, sessionId),
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
    assert.match(additionalContext(r), /## Persona/);
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

function turnCount(home, sid = 'default') {
  try {
    const entry = JSON.parse(fs.readFileSync(turnCountFile(home), 'utf8'))[sid];
    return entry ? entry.n : undefined;
  } catch { return undefined; }
}

test('drift-guard: zwykły prompt poniżej progu emituje krótki reminder', () => {
  withTempHome(home => {
    const env = { KRUX_DRIFT_INTERVAL: '5' };
    runHook(home, 'krux', env);
    const r = runHook(home, 'explain this code', env);
    assert.equal(r.status, 0);
    assert.match(additionalContext(r), /KRUX TURN — /);
    assert.match(additionalContext(r), /Krux = techniczny ork/);
    assert.match(additionalContext(r), /Wzorzec Krux:/);
    assert.match(additionalContext(r), /Wymagany format/);
    assert.doesNotMatch(additionalContext(r), /Nie:|ZAKAZ/);
    assert.doesNotMatch(additionalContext(r), /KRUX DRIFT-GUARD/);
  });
});

test('drift-guard: każda aktywna tura niesie kolejny dodatni przykład', () => {
  withTempHome(home => {
    const { MICRO_EXAMPLES } = require('../hooks/lib/drift-guard');
    const env = { KRUX_DRIFT_INTERVAL: '2' };
    runHook(home, 'krux', env);

    const outputs = [
      additionalContext(runHook(home, 'turn 1', env)),
      additionalContext(runHook(home, 'turn 2', env)),
      additionalContext(runHook(home, 'turn 3', env)),
      additionalContext(runHook(home, 'turn 4', env)),
    ];

    for (let index = 0; index < outputs.length; index += 1) {
      assert.ok(outputs[index].includes(MICRO_EXAMPLES[index]));
      assert.match(outputs[index], /Wzorzec Krux:/);
      assert.doesNotMatch(outputs[index], /Nie:|ZAKAZ/);
    }
    assert.match(outputs[0], /KRUX TURN — /);
    assert.match(outputs[1], /KRUX DRIFT-GUARD/);
    assert.match(outputs[2], /KRUX TURN — /);
    assert.match(outputs[3], /KRUX DRIFT-GUARD/);
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
    assert.match(additionalContext(runHook(home, 'turn 1', env)), /KRUX TURN — /);
    assert.match(additionalContext(runHook(home, 'turn 2', env)), /KRUX TURN — /);
    const r = runHook(home, 'turn 3', env);
    assert.match(additionalContext(r), /KRUX DRIFT-GUARD/);
    assert.match(additionalContext(r), /4 PRAWA:/);
    assert.doesNotMatch(additionalContext(r), /examples\.md|Nie:|ZAKAZ/);
    assert.equal(turnCount(home), undefined, 'licznik zresetowany po przypomnieniu');
  });
});

test('drift-guard: sesje liczą niezależnie — prompt sesji B nie dolicza do okna A', () => {
  withTempHome(home => {
    const env = { KRUX_DRIFT_INTERVAL: '3' };
    runHook(home, 'krux', env, 'sid-a');
    runHook(home, 'krux', env, 'sid-b');
    runHook(home, 'turn a1', env, 'sid-a');
    runHook(home, 'turn a2', env, 'sid-a');
    const rB = runHook(home, 'turn b1', env, 'sid-b');
    assert.match(additionalContext(rB), /KRUX TURN — /, 'sesja B dostaje reminder na pierwszym turnie');
    assert.equal(turnCount(home, 'sid-a'), 2, 'okno A nietknięte przez B');
    const rA = runHook(home, 'turn a3', env, 'sid-a');
    assert.match(additionalContext(rA), /KRUX DRIFT-GUARD/, 'A osiąga próg po własnych 3 turach');
    assert.equal(turnCount(home, 'sid-b'), 1, 'okno B dalej rośnie osobno');
  });
});

test('per-session gate: sesja bez własnej aktywacji nie dostaje reminderów mimo globalnego flaga', () => {
  withTempHome(home => {
    const env = { KRUX_DRIFT_INTERVAL: '3' };
    runHook(home, 'krux', env, 'sid-a');
    assert.equal(hasActive(home), true, 'globalny flag statusline istnieje');
    const rB = runHook(home, 'zwykły prompt', env, 'sid-b');
    assert.equal(rB.status, 0);
    assert.equal(rB.stdout, '', 'sesja B nigdy nie widziała persony — zero szumu');
    const rA = runHook(home, 'zwykły prompt', env, 'sid-a');
    assert.match(additionalContext(rA), /KRUX TURN/, 'sesja A dalej dostaje swój reminder');
  });
});

test('per-session gate: "stop krux" w sesji A nie wycisza reminderów żywej sesji B', () => {
  withTempHome(home => {
    const env = { KRUX_DRIFT_INTERVAL: '5' };
    runHook(home, 'krux', env, 'sid-a');
    runHook(home, 'krux', env, 'sid-b');
    runHook(home, 'stop krux', env, 'sid-a');
    assert.equal(hasActive(home), false, 'globalny flag statusline zdjęty');
    const rB = runHook(home, 'zwykły prompt', env, 'sid-b');
    assert.match(additionalContext(rB), /KRUX TURN/, 'B ma personę w kontekście — reminder zostaje');
  });
});

test('slash /krux:krux on|off przełącza trwały mode tak samo jak wariant $', () => {
  withTempHome(home => {
    const on = runHook(home, '/krux:krux on');
    assert.equal(on.status, 0);
    assert.equal(readMode(home), 'on');
    assert.equal(hasActive(home), true);

    const off = runHook(home, '/krux:krux off');
    assert.equal(off.status, 0);
    assert.equal(readMode(home), 'off');
    assert.equal(hasActive(home), false);
  });
});

test('one-shot /krux:krux resetuje licznik drift-guard (świeże wzmocnienie)', () => {
  withTempHome(home => {
    const env = { KRUX_DRIFT_INTERVAL: '5' };
    runHook(home, 'krux', env);
    runHook(home, 'turn 1', env);
    runHook(home, 'turn 2', env);
    assert.equal(turnCount(home), 2);
    runHook(home, '/krux:krux', env);
    assert.equal(turnCount(home), undefined, 'one-shot czyści okno jak każde wzmocnienie');
  });
});

test('drift-guard: próg emituje pełny guard zamiast krótkiego reminderu', () => {
  withTempHome(home => {
    const env = { KRUX_DRIFT_INTERVAL: '2' };
    runHook(home, 'krux', env);
    assert.match(additionalContext(runHook(home, 'turn 1', env)), /KRUX TURN — /);
    const threshold = additionalContext(runHook(home, 'turn 2', env));
    assert.match(threshold, /KRUX DRIFT-GUARD/);
    assert.doesNotMatch(threshold, /KRUX TURN — /);
  });
});

test('KRUX_TURN_REMINDER=0: cisza poniżej progu, pełny guard nadal działa', () => {
  withTempHome(home => {
    const env = { KRUX_DRIFT_INTERVAL: '2', KRUX_TURN_REMINDER: '0' };
    runHook(home, 'krux', env);
    assert.equal(runHook(home, 'turn 1', env).stdout, '');
    assert.match(additionalContext(runHook(home, 'turn 2', env)), /KRUX DRIFT-GUARD/);
  });
});

test('Codex PLUGIN_DATA: aktywna persona emituje ten sam per-turn reminder', () => {
  withTempHome(home => {
    const pluginData = fs.mkdtempSync(path.join(os.tmpdir(), 'krux-plugin-data-'));
    try {
      const env = { PLUGIN_DATA: pluginData, KRUX_DRIFT_INTERVAL: '5' };
      runHook(home, 'krux', env);
      const r = runHook(home, 'technical prompt', env);
      assert.match(additionalContext(r), /KRUX TURN — /);
      assert.equal(fs.existsSync(path.join(home, '.claude', '.krux-turn-count')), false);
      assert.equal(fs.existsSync(path.join(pluginData, '.krux-turn-count')), true);
    } finally {
      fs.rmSync(pluginData, { recursive: true, force: true });
    }
  });
});

test('drift-guard: jawne włączenie ("krux") resetuje licznik własnej sesji', () => {
  withTempHome(home => {
    const env = { KRUX_DRIFT_INTERVAL: '3' };
    runHook(home, 'krux', env);
    runHook(home, 'turn 1', env);
    runHook(home, 'turn 2', env);
    assert.equal(turnCount(home), 2);
    runHook(home, 'krux', env);
    assert.equal(turnCount(home), undefined, 'jawne ON czyści licznik');
  });
});

test('drift-guard: pełne emisje kontynuują rotację z lekkich kotwic', () => {
  withTempHome(home => {
    const { MICRO_EXAMPLES } = require('../hooks/lib/drift-guard');
    const env = { KRUX_DRIFT_INTERVAL: '2' };
    runHook(home, 'krux', env);

    const turn1 = additionalContext(runHook(home, 'turn 1', env));
    const first = additionalContext(runHook(home, 'turn 2', env));
    assert.ok(turn1.includes(MICRO_EXAMPLES[0]), 'lekka kotwica zużywa przykład 0');
    assert.match(first, /Wzorzec Krux:/, 'pełny reminder ma dodatnią kalibrację');
    assert.ok(first.includes(MICRO_EXAMPLES[1]), 'pierwsza pełna emisja = przykład 1');

    const turn3 = additionalContext(runHook(home, 'turn 3', env));
    const second = additionalContext(runHook(home, 'turn 4', env));
    assert.ok(turn3.includes(MICRO_EXAMPLES[2]), 'lekka kotwica kontynuuje przykład 2');
    assert.ok(second.includes(MICRO_EXAMPLES[3]), 'druga pełna emisja = przykład 3');
  });
});

test('drift-guard: jawne wyłączenie ("stop krux") czyści licznik własnej sesji', () => {
  withTempHome(home => {
    const env = { KRUX_DRIFT_INTERVAL: '5' };
    runHook(home, 'krux', env);
    runHook(home, 'turn 1', env);
    assert.equal(turnCount(home), 1);
    runHook(home, 'stop krux', env);
    assert.equal(turnCount(home), undefined, 'OFF czyści licznik');
  });
});
