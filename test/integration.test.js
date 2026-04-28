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
  const env = { ...process.env, HOME: home, USERPROFILE: home, ...extraEnv };
  for (const k of Object.keys(env)) {
    if (k.startsWith('KRUX_') && !(k in extraEnv)) delete env[k];
  }
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
    assert.ok(r.stdout.length < 500, `resume output za długi: ${r.stdout.length} znaków`);
    assert.match(r.stdout, /KRUX TRYB AKTYWNY/);
    assert.doesNotMatch(r.stdout, /## Persona/, 'resume NIE wstrzykuje sekcji Persona');
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('PreCompact konsumuje compact_notes.md (one-shot)', () => {
  const home = makeIsolatedHome();
  const cwdDir = fs.mkdtempSync(path.join(os.tmpdir(), 'krux-cwd-'));
  try {
    fs.mkdirSync(path.join(cwdDir, '.claude'), { recursive: true });
    const notesFile = path.join(cwdDir, '.claude', 'compact_notes.md');
    fs.writeFileSync(notesFile, 'Aktualny task: refactor X. Constraint: max 200 LOC.');

    const r = runHook('hooks/precompact.js', { cwd: cwdDir }, home);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /Aktualny task/);
    assert.equal(fs.existsSync(notesFile), false, 'plik notes musi być usunięty po użyciu');
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(cwdDir, { recursive: true, force: true });
  }
});

test('version-sync-guard blokuje gdy wersje rozjechane', () => {
  const home = makeIsolatedHome();
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'krux-repo-'));
  try {
    fs.mkdirSync(path.join(repo, '.claude-plugin'), { recursive: true });
    fs.writeFileSync(path.join(repo, 'package.json'), JSON.stringify({ name: 'krux', version: '1.0.0' }));
    fs.writeFileSync(path.join(repo, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'krux', version: '1.0.1' }));
    fs.writeFileSync(path.join(repo, '.claude-plugin', 'marketplace.json'), JSON.stringify({
      plugins: [{ name: 'krux', version: '1.0.0' }]
    }));

    const r = runHook('hooks/version-sync-guard.js', {
      tool_name: 'Edit',
      tool_input: { file_path: path.join(repo, 'package.json') },
      cwd: repo
    }, home);
    assert.equal(r.status, 2, 'rozjazd musi blokować exit 2');
    assert.match(r.stderr, /wersje rozjechane/);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(repo, { recursive: true, force: true });
  }
});
