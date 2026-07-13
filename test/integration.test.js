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

test('resume nie wstrzykuje pełnego SKILL.md', () => {
  const home = makeIsolatedHome();
  try {
    fs.writeFileSync(path.join(home, '.claude', '.krux-mode'), 'on');
    const r = runHook('hooks/activate.js', { source: 'resume' }, home);
    assert.equal(r.status, 0);
    assert.ok(r.stdout.length < 800, `resume output za długi: ${r.stdout.length} znaków`);
    assert.match(r.stdout, /KRUX TRYB AKTYWNY/);
    assert.doesNotMatch(r.stdout, /## Persona/, 'resume NIE wstrzykuje sekcji Persona');
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});
