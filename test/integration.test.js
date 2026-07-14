const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

function makeIsolatedHome() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'krux-int-'));
  fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
  return home;
}

function runHook(hookPath, input, home, extraEnv = {}) {
  const env = { ...process.env, HOME: home, ...extraEnv };
  for (const k of Object.keys(env)) {
    if (k.startsWith('KRUX_') && !(k in extraEnv)) delete env[k];
  }
  if (!('PLUGIN_DATA' in extraEnv)) delete env.PLUGIN_DATA;
  return spawnSync('node', [path.join(ROOT, hookPath)], {
    input: typeof input === 'string' ? input : JSON.stringify(input),
    env,
    encoding: 'utf8',
    cwd: ROOT,
    timeout: 5000,
  });
}

test('opt-out persistuje między sesjami (mode vs active asymetria)', () => {
  const home = makeIsolatedHome();
  try {
    const flagFile = path.join(home, '.claude', '.krux-active');
    const modeFile = path.join(home, '.claude', '.krux-mode');

    let r = runHook('hooks/activate.js', { source: 'startup' }, home);
    assert.equal(r.status, 0);
    assert.equal(fs.existsSync(flagFile), true, 'flag musi powstać przy starcie');

    r = runHook('hooks/krux-toggle.js', { prompt: 'stop krux' }, home);
    assert.equal(r.status, 0);
    assert.equal(fs.existsSync(flagFile), false, 'flag zniknął');
    assert.equal(fs.readFileSync(modeFile, 'utf8').trim(), 'off');

    r = runHook('hooks/activate.js', { source: 'startup' }, home);
    assert.equal(r.status, 0);
    assert.equal(fs.existsSync(flagFile), false, 'opt-out persystuje przez sesje');
    assert.equal(r.stdout.trim(), 'OK');
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('flow i persona są ortogonalne', () => {
  const home = makeIsolatedHome();
  try {
    const personaActive = path.join(home, '.claude', '.krux-active');
    const flowActive = path.join(home, '.claude', '.krux-flow-active');

    runHook('hooks/activate.js', { source: 'startup' }, home);
    assert.equal(fs.existsSync(personaActive), true);

    runHook('hooks/krux-flow-toggle.js', { prompt: 'flow' }, home);
    assert.equal(fs.existsSync(flowActive), true);
    assert.equal(fs.existsSync(personaActive), true, 'flow ON nie wpływa na personę');

    runHook('hooks/krux-toggle.js', { prompt: 'stop krux' }, home);
    assert.equal(fs.existsSync(personaActive), false);
    assert.equal(fs.existsSync(flowActive), true, 'persona off nie wpływa na flow');

    runHook('hooks/krux-flow-toggle.js', { prompt: 'flow off' }, home);
    assert.equal(fs.existsSync(flowActive), false);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('drift-guard: pełny cykl per-sesja — cisza, przypomnienie na progu, powtórka, reset przez compact', () => {
  const home = makeIsolatedHome();
  try {
    const env = { KRUX_DRIFT_INTERVAL: '3' };
    const SID = 'session-one';
    const countOf = (sid) => {
      try {
        const entry = JSON.parse(
          fs.readFileSync(path.join(home, '.claude', '.krux-turn-count'), 'utf8')
        )[sid];
        return entry ? entry.n : undefined;
      } catch { return undefined; }
    };

    let r = runHook('hooks/activate.js', { source: 'startup', session_id: SID }, home, env);
    assert.equal(r.status, 0);

    r = runHook('hooks/krux-toggle.js', { prompt: 'turn 1', session_id: SID }, home, env);
    assert.equal(r.stdout, '', 'turn 1/3: cisza');
    r = runHook('hooks/krux-toggle.js', { prompt: 'turn 2', session_id: SID }, home, env);
    assert.equal(r.stdout, '', 'turn 2/3: cisza');
    r = runHook('hooks/krux-toggle.js', { prompt: 'turn 3', session_id: SID }, home, env);
    assert.match(r.stdout, /KRUX DRIFT-GUARD/, 'turn 3/3: próg osiągnięty');
    assert.equal(countOf(SID), undefined, 'licznik zresetowany po przypomnieniu');

    // Cykl się powtarza — kolejne okno liczy znów od zera, nie jest one-shot.
    r = runHook('hooks/krux-toggle.js', { prompt: 'turn 4', session_id: SID }, home, env);
    assert.equal(r.stdout, '', 'nowe okno turn 1/3: znów cisza');
    r = runHook('hooks/krux-toggle.js', { prompt: 'turn 5', session_id: SID }, home, env);
    assert.equal(r.stdout, '', 'nowe okno turn 2/3: znów cisza');
    assert.equal(countOf(SID), 2);

    // Compact w środku okna przerywa liczenie — pełna reinjekcja to nowe wzmocnienie.
    r = runHook('hooks/activate.js', { source: 'compact', session_id: SID }, home, env);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /PRAWO 1/, 'compact wstrzykuje pełne SKILL.md');
    assert.equal(countOf(SID), undefined, 'compact zresetował licznik w trakcie okna');

    r = runHook('hooks/krux-toggle.js', { prompt: 'turn po compact', session_id: SID }, home, env);
    assert.equal(r.stdout, '', 'świeże okno po compact: cisza, nie natychmiastowe przypomnienie');
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('resume nie wstrzykuje pełnego SKILL.md', () => {
  const home = makeIsolatedHome();
  try {
    fs.writeFileSync(path.join(home, '.claude', '.krux-mode'), 'on');
    const r = runHook('hooks/activate.js', { source: 'resume' }, home);
    assert.equal(r.status, 0);
    assert.ok(r.stdout.length < 1100, `resume output za długi: ${r.stdout.length} znaków`);
    assert.match(r.stdout, /KRUX TRYB AKTYWNY/);
    assert.doesNotMatch(r.stdout, /## Persona/, 'resume NIE wstrzykuje sekcji Persona');
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});
