// Tests for hooks/krux-horda-trigger.js — UserPromptSubmit delegation nudge.
// Strategy: spawn hook with isolated HOME, feed prompt JSON, assert emitted
// nudge + per-session throttle state. Matching is best-effort word-boundary
// with diacritics folding; Polish inflection deliberately unsupported.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const HOOK = path.join(__dirname, '..', 'hooks', 'krux-horda-trigger.js');

function withTempHome(fn) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'krux-horda-test-'));
  try { fn(home); } finally { fs.rmSync(home, { recursive: true, force: true }); }
}

function buildEnv(home, extraEnv = {}) {
  const cleanEnv = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (!k.startsWith('KRUX_') && k !== 'PLUGIN_DATA') cleanEnv[k] = v;
  }
  return { ...cleanEnv, HOME: home, ...extraEnv };
}

function runHook(home, prompt, extraEnv = {}, sessionId = 'sid-test') {
  return spawnSync('node', [HOOK], {
    input: JSON.stringify({ prompt, session_id: sessionId }),
    env: buildEnv(home, extraEnv),
    encoding: 'utf8',
    timeout: 5000,
  });
}

function nudgeText(result) {
  if (!result.stdout) return '';
  return JSON.parse(result.stdout).hookSpecificOutput.additionalContext;
}

test('prompt z triggerem "debug" emituje nudge z ork-tropiciel i bramką korzyści', () => {
  withTempHome(home => {
    const r = runHook(home, 'debug tego crasha w parserze');
    assert.equal(r.status, 0);
    const text = nudgeText(r);
    assert.match(text, /HORDA/);
    assert.match(text, /ork-tropiciel/);
    assert.match(text, /[Bb]ramk/);
    assert.match(text, /orchestration\.md/);
  });
});

test('prompt bez triggera nie emituje nic', () => {
  withTempHome(home => {
    const r = runHook(home, 'opowiedz o architekturze tego projektu');
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '');
  });
});

test('word boundary: "protest" i "przetestuj" nie łapią triggera "test"', () => {
  withTempHome(home => {
    for (const prompt of ['protest przeciw zmianom', 'przetestuj to potem']) {
      const r = runHook(home, prompt);
      assert.equal(r.stdout, '', `prompt=${JSON.stringify(prompt)} nie może triggerować`);
    }
  });
});

test('diacritics fold: "blad" (ASCII) i "BŁĄD" łapią trigger "błąd"', () => {
  for (const prompt of ['mam blad w module auth', 'BŁĄD przy starcie serwera']) {
    withTempHome(home => {
      const r = runHook(home, prompt);
      assert.match(nudgeText(r), /ork-tropiciel/, `prompt=${JSON.stringify(prompt)}`);
    });
  }
});

test('wiele ról naraz: "debug i testy" wymienia tropiciela i testera', () => {
  withTempHome(home => {
    const text = nudgeText(runHook(home, 'debug i testy modułu płatności'));
    assert.match(text, /ork-tropiciel/);
    assert.match(text, /ork-tester/);
  });
});

test('throttle: po nudge cisza aż interval turnów minie, potem znowu nudge', () => {
  withTempHome(home => {
    const env = { KRUX_HORDA_NUDGE_INTERVAL: '2' };
    assert.match(nudgeText(runHook(home, 'debug pierwszy', env)), /HORDA/, 'pierwszy match strzela od razu');
    assert.equal(runHook(home, 'debug drugi', env).stdout, '', 'tura po nudge: throttle milczy');
    assert.match(nudgeText(runHook(home, 'debug trzeci', env)), /HORDA/, 'po interval turach znowu wolno');
  });
});

test('throttle: tury bez triggera też liczą się do okna', () => {
  withTempHome(home => {
    const env = { KRUX_HORDA_NUDGE_INTERVAL: '2' };
    runHook(home, 'debug start', env);
    runHook(home, 'zwykła rozmowa', env);
    runHook(home, 'dalej zwykła rozmowa', env);
    assert.match(nudgeText(runHook(home, 'debug znowu', env)), /HORDA/, 'okno przeszło na turach bez triggera');
  });
});

test('sesje niezależne: świeża sesja nudguje mimo throttle innej sesji', () => {
  withTempHome(home => {
    const env = { KRUX_HORDA_NUDGE_INTERVAL: '5' };
    runHook(home, 'debug w sesji A', env, 'sid-a');
    assert.equal(runHook(home, 'debug znowu A', env, 'sid-a').stdout, '', 'A w throttle');
    assert.match(nudgeText(runHook(home, 'debug w sesji B', env, 'sid-b')), /HORDA/, 'B ma własne okno');
  });
});

test('nudge działa niezależnie od stanu persony (brak .krux-active)', () => {
  withTempHome(home => {
    assert.equal(fs.existsSync(path.join(home, '.claude', '.krux-active')), false);
    assert.match(nudgeText(runHook(home, 'review tego diffa')), /ork-sedzia/);
  });
});

test('KRUX_HORDA_NUDGE=0 wyłącza nudge całkowicie', () => {
  withTempHome(home => {
    const r = runHook(home, 'debug crasha', { KRUX_HORDA_NUDGE: '0' });
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '');
  });
});

test('malformed stdin: exit 0 bez outputu', () => {
  withTempHome(home => {
    const r = spawnSync('node', [HOOK], {
      input: 'not-json',
      env: buildEnv(home),
      encoding: 'utf8',
      timeout: 5000,
    });
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '');
  });
});

test('PLUGIN_DATA ustawione: stan throttle pod PLUGIN_DATA, nie pod ~/.claude', () => {
  withTempHome(home => {
    const pluginData = fs.mkdtempSync(path.join(os.tmpdir(), 'krux-plugin-data-'));
    try {
      runHook(home, 'debug crasha', { PLUGIN_DATA: pluginData });
      assert.equal(fs.existsSync(path.join(pluginData, '.krux-horda-nudge')), true);
      assert.equal(fs.existsSync(path.join(home, '.claude', '.krux-horda-nudge')), false);
    } finally {
      fs.rmSync(pluginData, { recursive: true, force: true });
    }
  });
});
