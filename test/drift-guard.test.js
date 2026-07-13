// Tests for hooks/lib/drift-guard.js — shared persona drift-guard module.
// Pure module, no stdin/CLI surface — tested in-process like lib/state-dir.js.

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

test('REMINDER_CORE zawiera frazy zgodne z dzisiejszym resume reminderem', () => {
  assert.match(REMINDER_CORE, /persona Krux dalej działa/);
  assert.match(REMINDER_CORE, /nie wymagany format ani strukturę/);
  assert.doesNotMatch(REMINDER_CORE, /PRAWO 1/);
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

test('bumpTurnCount: poniżej progu zwraca false i persystuje licznik na dysku', () => {
  withTempDir(dir => {
    withEnv('KRUX_DRIFT_INTERVAL', '3', () => {
      assert.equal(bumpTurnCount(dir), false);
      assert.equal(fs.readFileSync(countPath(dir), 'utf8'), '1');
      assert.equal(bumpTurnCount(dir), false);
      assert.equal(fs.readFileSync(countPath(dir), 'utf8'), '2');
    });
  });
});

test('bumpTurnCount: dokładnie na progu zwraca true i resetuje plik licznika', () => {
  withTempDir(dir => {
    withEnv('KRUX_DRIFT_INTERVAL', '3', () => {
      assert.equal(bumpTurnCount(dir), false);
      assert.equal(bumpTurnCount(dir), false);
      assert.equal(bumpTurnCount(dir), true, 'trzeci bump = próg osiągnięty');
      assert.equal(fs.existsSync(countPath(dir)), false, 'plik licznika skasowany po progu');
    });
  });
});

test('bumpTurnCount: po osiągnięciu progu kolejne okno liczy od nowa', () => {
  withTempDir(dir => {
    withEnv('KRUX_DRIFT_INTERVAL', '2', () => {
      assert.equal(bumpTurnCount(dir), false);
      assert.equal(bumpTurnCount(dir), true);
      assert.equal(bumpTurnCount(dir), false, 'nowe okno: pierwszy bump po resecie znów poniżej progu');
      assert.equal(fs.readFileSync(countPath(dir), 'utf8'), '1');
    });
  });
});

test('resetTurnCount: usuwa plik licznika, brak błędu gdy plik nie istnieje', () => {
  withTempDir(dir => {
    assert.doesNotThrow(() => resetTurnCount(dir));
    bumpTurnCount(dir);
    assert.equal(fs.existsSync(countPath(dir)), true);
    resetTurnCount(dir);
    assert.equal(fs.existsSync(countPath(dir)), false);
  });
});

test('bumpTurnCount: uszkodzony/nie-numeryczny plik licznika traktowany jako 0', () => {
  withTempDir(dir => {
    withEnv('KRUX_DRIFT_INTERVAL', '5', () => {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(countPath(dir), 'not-a-number');
      assert.equal(bumpTurnCount(dir), false);
      assert.equal(fs.readFileSync(countPath(dir), 'utf8'), '1');
    });
  });
});
