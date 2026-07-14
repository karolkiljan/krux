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
  REMINDER_CORE,
  DEFAULT_INTERVAL,
  driftInterval,
  countPath,
  readCount,
  writeCount,
  clearCount,
  resetTurnCount,
  bumpTurnCount,
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

test('REMINDER_CORE zawiera frazy zgodne z resume reminderem', () => {
  assert.match(REMINDER_CORE, /persona Krux dalej działa/);
  assert.match(REMINDER_CORE, /nie wymagany format ani strukturę/);
  assert.doesNotMatch(REMINDER_CORE, /PRAWO 1/);
});

test('REMINDER_CORE pokrywa dryf do A: łamana gramatyka i kompresja przypomniane', () => {
  assert.match(REMINDER_CORE, /[łŁ]amana gramatyka/);
  assert.match(REMINDER_CORE, /dryf do A/);
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

test('REMINDER_CORE przypomina klimat, nie tylko gramatykę', () => {
  assert.match(REMINDER_CORE, /akcent postaci[^\n]*moods\.md/);
  assert.match(REMINDER_CORE, /metafora górnicza[^\n]*lore\.md/);
});
