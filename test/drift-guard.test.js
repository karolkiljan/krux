// Tests for hooks/lib/drift-guard.js — shared persona drift-guard module.
// Pure module, no stdin/CLI surface — tested in-process like lib/state-dir.js.
// v2.8.0: counter is per-session (keyed by session_id) inside one JSON map file,
// so concurrent sessions do not thrash each other's windows.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  TURN_REMINDER,
  turnReminderEnabled,
  REMINDER_CORE,
  IDENTITY_ANCHOR,
  VOICE_CONTRACT,
  TASK_CONTRACT,
  MICRO_EXAMPLES,
  buildTurnReminder,
  buildFullReminder,
  EMIT_FILENAME,
  nextMicroExample,
  DEFAULT_INTERVAL,
  driftInterval,
  countPath,
  readCount,
  writeCount,
  clearCount,
  resetTurnCount,
  bumpTurnCount,
  CODEX_TURN_FILENAME,
  DEFAULT_TOOL_INTERVAL,
  toolInterval,
  markPromptTurn,
  isStrictTurn,
  shouldReinforceAfterTool,
} = require('../hooks/lib/drift-guard');

function withEnv(key, value, fn) {
  const original = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
  try {
    fn();
  } finally {
    if (original === undefined) delete process.env[key];
    else process.env[key] = original;
  }
}

function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'krux-drift-test-'));
  try { fn(dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

function readMap(dir) {
  return JSON.parse(fs.readFileSync(countPath(dir), 'utf8'));
}

test('kotwica łączy tożsamość, dodatni wzorzec i kontrakt zadania', () => {
  const turn = buildTurnReminder(MICRO_EXAMPLES[0]);
  assert.match(turn, /Krux = techniczny ork/);
  assert.match(turn, /Wzorzec Krux:/);
  assert.match(turn, /Zwykła odpowiedź zaczynać.*Kod działać.*Testy zielone/);
  assert.match(turn, /Wymagany format/);
  assert.match(turn, /warunek.*przyczyna.*ryzyko.*wynik weryfikacji/);
  assert.doesNotMatch(turn, /Nie:|ZAKAZ|dryf do [AC]/);
  assert.ok(turn.length <= 420, 'kotwica turn ma ' + turn.length + ' zn');
});

test('pełna kotwica zachowuje 4 PRAWA i dwie osie bez listy zakazów', () => {
  const full = buildFullReminder(MICRO_EXAMPLES[1]);
  assert.match(full, /Krux = techniczny ork/);
  assert.match(full, /4 PRAWA: wynik pierwszy; łamana gramatyka; prosty słownik; kompresja/);
  assert.match(full, /Wymagany format/);
  assert.match(full, /Wzorzec Krux:/);
  assert.doesNotMatch(full, /Nie:|ZAKAZ|dryf do [AC]/);
});

test('stałe kompatybilności budowane są z pierwszego dodatniego przykładu', () => {
  assert.equal(TURN_REMINDER, buildTurnReminder(MICRO_EXAMPLES[0]));
  assert.equal(REMINDER_CORE, buildFullReminder(MICRO_EXAMPLES[0]));
  assert.match(IDENTITY_ANCHOR, /[łŁ]amana gramatyka/);
  assert.match(VOICE_CONTRACT, /zaczynać/);
  assert.match(TASK_CONTRACT, /Wymagany format/);
});

test('MICRO_EXAMPLES pokazują wyłącznie docelową odpowiedź', () => {
  assert.ok(MICRO_EXAMPLES.length >= 4, 'pula musi dawać realną rotację');
  for (const example of MICRO_EXAMPLES) {
    assert.match(example, /^Wzorzec Krux:/, 'przykład pokazuje docelowy kształt');
    assert.doesNotMatch(example, /Nie:|ZAKAZ|→ Krux:/, 'brak anty-wzorca');
    assert.doesNotMatch(example, /\n/, 'przykład mieści się w jednej linii');
  }
});

test('REMINDER_CORE zachowuje dodatni kontrakt resume', () => {
  assert.match(REMINDER_CORE, /Krux = techniczny ork/);
  assert.match(REMINDER_CORE, /Wymagany format/);
  assert.match(REMINDER_CORE, /Wzorzec Krux:/);
  assert.doesNotMatch(REMINDER_CORE, /Nie:|ZAKAZ/);
});

test('REMINDER_CORE podaje cel zamiast nazywać dryf', () => {
  assert.match(REMINDER_CORE, /[łŁ]amana gramatyka/);
  assert.match(REMINDER_CORE, /kompresj/);
  assert.doesNotMatch(REMINDER_CORE, /dryf do [AC]/);
});

// Własności zamiast dosłownej kopii stringa: brzmienie może się zmieniać bez
// churnu testów, dopóki reminder trzyma obie osie i mieści się w budżecie.
test('TURN_REMINDER utrzymuje techniczny konkret i głos jako dwie osie', () => {
  assert.match(TURN_REMINDER, /techniczny ork/, 'oś 1: konkret nie znika');
  assert.match(TURN_REMINDER, /[łŁ]amana gramatyka/, 'oś 2: głos nie znika');
  assert.match(TURN_REMINDER, /kompresj/, 'kompresja przypomniana');
  assert.ok(TURN_REMINDER.length <= 420, 'TURN_REMINDER ma ' + TURN_REMINDER.length + ' zn');
});

test('turnReminderEnabled(): domyślnie ON, tylko 0/off wyłącza', () => {
  for (const value of [undefined, '', '1', 'on', 'false']) {
    withEnv('KRUX_TURN_REMINDER', value, () => assert.equal(turnReminderEnabled(), true));
  }
  for (const value of ['0', 'off', 'OFF']) {
    withEnv('KRUX_TURN_REMINDER', value, () => assert.equal(turnReminderEnabled(), false));
  }
});

test('REMINDER_CORE wymaga równocześnie głosu i kompletnego zadania', () => {
  assert.match(REMINDER_CORE, /Krux = techniczny ork/);
  assert.match(REMINDER_CORE, /warunek.*przyczyna.*ryzyko.*wynik weryfikacji/);
});

test('REMINDER_CORE zachowuje wąskie neutralne granice', () => {
  assert.match(REMINDER_CORE, /Wymagany format, struktura, kod/);
  assert.doesNotMatch(REMINDER_CORE, /nadpisuje|porzuca/);
});

test('driftInterval(): domyślnie DEFAULT_INTERVAL bez env', () => {
  withEnv('KRUX_DRIFT_INTERVAL', undefined, () => {
    assert.equal(driftInterval(), DEFAULT_INTERVAL);
  });
});

test('driftInterval(): respektuje KRUX_DRIFT_INTERVAL gdy dodatnia liczba', () => {
  withEnv('KRUX_DRIFT_INTERVAL', '3', () => {
    assert.equal(driftInterval(), 3);
  });
});

test('driftInterval(): fallback do default gdy env niepoprawny (0, ujemny, nie-liczba)', () => {
  for (const bad of ['0', '-5', 'abc', '']) {
    withEnv('KRUX_DRIFT_INTERVAL', bad, () => {
      assert.equal(driftInterval(), DEFAULT_INTERVAL, `bad=${JSON.stringify(bad)}`);
    });
  }
});

test('bumpTurnCount: poniżej progu zwraca false i persystuje licznik pod session_id', () => {
  withTempDir(dir => {
    withEnv('KRUX_DRIFT_INTERVAL', '3', () => {
      assert.equal(bumpTurnCount(dir, 'sid-a'), false);
      assert.equal(readMap(dir)['sid-a'].n, 1);
      assert.equal(bumpTurnCount(dir, 'sid-a'), false);
      assert.equal(readMap(dir)['sid-a'].n, 2);
    });
  });
});

test('bumpTurnCount: dokładnie na progu zwraca true i czyści wpis sesji', () => {
  withTempDir(dir => {
    withEnv('KRUX_DRIFT_INTERVAL', '3', () => {
      assert.equal(bumpTurnCount(dir, 'sid-a'), false);
      assert.equal(bumpTurnCount(dir, 'sid-a'), false);
      assert.equal(bumpTurnCount(dir, 'sid-a'), true, 'trzeci bump = próg osiągnięty');
      assert.equal(readMap(dir)['sid-a'], undefined, 'wpis sesji skasowany po progu');
    });
  });
});

test('bumpTurnCount: sesje liczą niezależnie — bump sid-b nie rusza sid-a', () => {
  withTempDir(dir => {
    withEnv('KRUX_DRIFT_INTERVAL', '3', () => {
      bumpTurnCount(dir, 'sid-a');
      bumpTurnCount(dir, 'sid-a');
      assert.equal(bumpTurnCount(dir, 'sid-b'), false, 'świeża sesja B startuje od zera');
      assert.equal(readMap(dir)['sid-a'].n, 2, 'licznik A nietknięty przez B');
      assert.equal(readMap(dir)['sid-b'].n, 1);
      assert.equal(bumpTurnCount(dir, 'sid-a'), true, 'A osiąga próg niezależnie');
    });
  });
});

test('bumpTurnCount: brak session_id → klucz "default"', () => {
  withTempDir(dir => {
    withEnv('KRUX_DRIFT_INTERVAL', '5', () => {
      bumpTurnCount(dir, undefined);
      assert.equal(readMap(dir)['default'].n, 1);
    });
  });
});

test('resetTurnCount: czyści tylko własną sesję, cudza zostaje', () => {
  withTempDir(dir => {
    withEnv('KRUX_DRIFT_INTERVAL', '10', () => {
      bumpTurnCount(dir, 'sid-a');
      bumpTurnCount(dir, 'sid-b');
      resetTurnCount(dir, 'sid-a');
      const map = readMap(dir);
      assert.equal(map['sid-a'], undefined, 'własny wpis skasowany');
      assert.equal(map['sid-b'].n, 1, 'cudzy wpis nietknięty');
    });
  });
});

test('resetTurnCount: brak pliku = brak błędu', () => {
  withTempDir(dir => {
    assert.doesNotThrow(() => resetTurnCount(dir, 'sid-a'));
  });
});

test('uszkodzony plik licznika traktowany jako pusty', () => {
  withTempDir(dir => {
    withEnv('KRUX_DRIFT_INTERVAL', '5', () => {
      fs.writeFileSync(countPath(dir), 'not-json{{{');
      assert.equal(bumpTurnCount(dir, 'sid-a'), false);
      assert.equal(readMap(dir)['sid-a'].n, 1);
    });
  });
});

test('stary format (goły int z v2.7.0) traktowany jako pusty — migracja bez wybuchu', () => {
  withTempDir(dir => {
    withEnv('KRUX_DRIFT_INTERVAL', '5', () => {
      fs.writeFileSync(countPath(dir), '7');
      assert.equal(bumpTurnCount(dir, 'sid-a'), false, 'stary licznik nie przenosi się na sesję');
      assert.equal(readMap(dir)['sid-a'].n, 1);
    });
  });
});

test('prune: wpisy starsze niż 24h wylatują przy zapisie', () => {
  withTempDir(dir => {
    withEnv('KRUX_DRIFT_INTERVAL', '10', () => {
      const stale = { 'sid-old': { n: 4, t: Date.now() - 25 * 60 * 60 * 1000 } };
      fs.writeFileSync(countPath(dir), JSON.stringify(stale));
      bumpTurnCount(dir, 'sid-new');
      const map = readMap(dir);
      assert.equal(map['sid-old'], undefined, 'martwa sesja sprzątnięta');
      assert.equal(map['sid-new'].n, 1);
    });
  });
});

// --- generyczny magazyn liczników (reuse przez hook nudge Hordy) ---

test('readCount/writeCount/clearCount: własny plik, per-sid, undefined dla braku wpisu', () => {
  withTempDir(dir => {
    const FILE = '.krux-horda-nudge';
    assert.equal(readCount(dir, FILE, 'sid-a'), undefined, 'brak wpisu = undefined, nie 0');
    writeCount(dir, FILE, 'sid-a', 0);
    assert.equal(readCount(dir, FILE, 'sid-a'), 0);
    writeCount(dir, FILE, 'sid-a', 3);
    assert.equal(readCount(dir, FILE, 'sid-a'), 3);
    assert.equal(readCount(dir, FILE, 'sid-b'), undefined, 'inna sesja niezależna');
    clearCount(dir, FILE, 'sid-a');
    assert.equal(readCount(dir, FILE, 'sid-a'), undefined);
    assert.equal(fs.existsSync(countPath(dir)), false, 'osobny plik nie dotyka licznika drift');
  });
});

test('writeCount: prune 24h działa też w magazynie generycznym', () => {
  withTempDir(dir => {
    const FILE = '.krux-horda-nudge';
    const stale = { 'sid-old': { n: 1, t: Date.now() - 25 * 60 * 60 * 1000 } };
    fs.writeFileSync(path.join(dir, FILE), JSON.stringify(stale));
    writeCount(dir, FILE, 'sid-new', 0);
    const map = JSON.parse(fs.readFileSync(path.join(dir, FILE), 'utf8'));
    assert.equal(map['sid-old'], undefined);
    assert.equal(map['sid-new'].n, 0);
  });
});

test('REMINDER_CORE kalibruje głos dodatnim przykładem', () => {
  assert.match(REMINDER_CORE, /Wzorzec Krux:/);
  assert.doesNotMatch(REMINDER_CORE, /moods\.md|lore\.md/);
});

test('REMINDER_CORE nie kształtuje wyjścia listą błędów A/C', () => {
  assert.doesNotMatch(REMINDER_CORE, /dryf do A|dryf do C|dodać konkret, nie wygładzać/);
  assert.match(REMINDER_CORE, /Wymagany format/);
});

// Budżet resume pilnowany JEDNYM realnym pomiarem stdout w integration.test.js
// ('resume nie wstrzykuje pełnego SKILL.md') — bez drugiego, ręcznie liczonego
// limitu tutaj, który rozjeżdżał się z rzeczywistością przy każdej zmianie
// bloku statusline.

test('writeStore: zapis atomowy — po zapisie nie zostaje plik tymczasowy', () => {
  withTempDir(dir => {
    writeCount(dir, '.krux-horda-nudge', 'sid-a', 3);
    const leftovers = fs.readdirSync(dir).filter(f => f.includes('.tmp.'));
    assert.deepEqual(leftovers, [], 'tmp po rename nie istnieje');
    assert.equal(readCount(dir, '.krux-horda-nudge', 'sid-a'), 3);
  });
});

// --- stan aktywacji persony per sesja ---

test('markSessionActive/isSessionActive/clearSessionActive: gate per session_id', () => {
  withTempDir(dir => {
    const { markSessionActive, clearSessionActive, isSessionActive } =
      require('../hooks/lib/drift-guard');
    assert.equal(isSessionActive(dir, 'sid-a'), false, 'brak wpisu = nieaktywna');
    markSessionActive(dir, 'sid-a');
    assert.equal(isSessionActive(dir, 'sid-a'), true);
    assert.equal(isSessionActive(dir, 'sid-b'), false, 'inna sesja niezależna');
    clearSessionActive(dir, 'sid-a');
    assert.equal(isSessionActive(dir, 'sid-a'), false);
    assert.equal(fs.existsSync(countPath(dir)), false, 'gate nie dotyka licznika drift');
  });
});

// --- rotowany mikro-przykład kalibracyjny ---

test('MICRO_EXAMPLES: każdy dodatni wzorzec mieści się w jednej linii', () => {
  assert.ok(MICRO_EXAMPLES.length >= 4, 'pula musi dawać realną rotację');
  for (const example of MICRO_EXAMPLES) {
    assert.match(example, /^Wzorzec Krux:/);
    assert.doesNotMatch(example, /Nie:|ZAKAZ|→ Krux:/);
    assert.doesNotMatch(example, /\n/, 'wzorzec mieści się w jednej linii');
  }
});

test('nextMicroExample: rotuje deterministycznie i wraca na początek puli', () => {
  withTempDir(dir => {
    const seen = [];
    for (let i = 0; i < MICRO_EXAMPLES.length + 1; i++) {
      seen.push(nextMicroExample(dir, 'sid-a'));
    }
    assert.deepEqual(seen.slice(0, MICRO_EXAMPLES.length), MICRO_EXAMPLES, 'pełny cykl w kolejności puli');
    assert.equal(seen[MICRO_EXAMPLES.length], MICRO_EXAMPLES[0], 'po cyklu rotacja wraca na start');
  });
});

test('nextMicroExample: sesje rotują niezależnie', () => {
  withTempDir(dir => {
    nextMicroExample(dir, 'sid-a');
    nextMicroExample(dir, 'sid-a');
    assert.equal(nextMicroExample(dir, 'sid-b'), MICRO_EXAMPLES[0], 'świeża sesja startuje od pierwszej pary');
    assert.equal(nextMicroExample(dir, 'sid-a'), MICRO_EXAMPLES[2], 'sesja A kontynuuje własny cykl');
  });
});

test('nextMicroExample: własny plik stanu, licznik okna drift nietknięty', () => {
  withTempDir(dir => {
    nextMicroExample(dir, 'sid-a');
    assert.equal(fs.existsSync(path.join(dir, EMIT_FILENAME)), true);
    assert.equal(fs.existsSync(countPath(dir)), false, 'rotacja nie pisze do .krux-turn-count');
  });
});

test('resetTurnCount nie kasuje rotacji — wzmocnienie persony nie cofa cyklu', () => {
  withTempDir(dir => {
    nextMicroExample(dir, 'sid-a');
    resetTurnCount(dir, 'sid-a');
    assert.equal(nextMicroExample(dir, 'sid-a'), MICRO_EXAMPLES[1], 'cykl idzie dalej po resecie okna');
  });
});

// --- natywna kotwica wewnątrz tury narzędziowej Codexa ---

test('toolInterval: domyślnie cztery, poprawny env zmienia próg', () => {
  assert.equal(toolInterval({}), DEFAULT_TOOL_INTERVAL);
  assert.equal(toolInterval({ KRUX_CODEX_TOOL_INTERVAL: '2' }), 2);
  assert.equal(toolInterval({ KRUX_CODEX_TOOL_INTERVAL: '0' }), DEFAULT_TOOL_INTERVAL);
});

test('regularny prompt kotwiczy turn, potem reminder wraca co czwarte narzędzie', () => {
  withTempDir(dir => {
    markPromptTurn(dir, 'sid-a', 'turn-a', { strict: false });
    assert.equal(shouldReinforceAfterTool(dir, 'sid-a', 'turn-a', { KRUX_CODEX_TOOL_INTERVAL: '4' }), false);
    assert.equal(shouldReinforceAfterTool(dir, 'sid-a', 'turn-a', { KRUX_CODEX_TOOL_INTERVAL: '4' }), false);
    assert.equal(shouldReinforceAfterTool(dir, 'sid-a', 'turn-a', { KRUX_CODEX_TOOL_INTERVAL: '4' }), false);
    assert.equal(shouldReinforceAfterTool(dir, 'sid-a', 'turn-a', { KRUX_CODEX_TOOL_INTERVAL: '4' }), true);
  });
});

test('automatyczna tura bez UserPromptSubmit dostaje reminder po pierwszym toolu', () => {
  withTempDir(dir => {
    assert.equal(shouldReinforceAfterTool(dir, 'sid-a', 'goal-turn', {}), true);
    assert.equal(shouldReinforceAfterTool(dir, 'sid-a', 'goal-turn', {}), false);
    assert.equal(fs.existsSync(path.join(dir, CODEX_TURN_FILENAME)), true);
  });
});

test('format ścisły jest zapisany tylko dla dokładnego turn_id', () => {
  withTempDir(dir => {
    markPromptTurn(dir, 'sid-a', 'json-turn', { strict: true });
    assert.equal(isStrictTurn(dir, 'sid-a', 'json-turn'), true);
    assert.equal(isStrictTurn(dir, 'sid-a', 'next-turn'), false);
    assert.equal(isStrictTurn(dir, 'sid-b', 'json-turn'), false);
  });
});

test('brak turn_id nie tworzy stanu ani reminderu', () => {
  withTempDir(dir => {
    markPromptTurn(dir, 'sid-a', '', { strict: true });
    assert.equal(shouldReinforceAfterTool(dir, 'sid-a', '', {}), false);
    assert.equal(isStrictTurn(dir, 'sid-a', ''), false);
    assert.equal(fs.existsSync(path.join(dir, CODEX_TURN_FILENAME)), false);
  });
});
