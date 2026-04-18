// Tests for hooks/activate.js — SessionStart hook.
// Responsibilities:
//   1. mode=off → remove flag, exit 0 with "OK"
//   2. mode=on + startup → emit full SKILL.md body (frontmatter stripped)
//   3. mode=on + resume/compact → emit short reminder (no SKILL.md)
//   4. Copy statusline script to ~/.claude/ on every run
//   5. Prompt for statusline setup on first run when settings missing

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const HOOK = path.join(__dirname, '..', 'hooks', 'activate.js');

function withTempHome(fn) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'snaf-act-test-'));
  try { fn(home); } finally { fs.rmSync(home, { recursive: true, force: true }); }
}

function runHook(home, payload = null, extraEnv = {}) {
  // Strip ambient SNAF_* to avoid test pollution from shell-level config.
  const cleanEnv = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (!k.startsWith('SNAF_')) cleanEnv[k] = v;
  }
  return spawnSync('node', [HOOK], {
    input: payload === null ? '' : JSON.stringify(payload),
    env: { ...cleanEnv, HOME: home, USERPROFILE: home, ...extraEnv },
    encoding: 'utf8',
    timeout: 5000,
  });
}

function writeMode(home, mode) {
  const dir = path.join(home, '.claude');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, '.snaf-mode'), mode);
}

function writeSettings(home, settings) {
  const dir = path.join(home, '.claude');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify(settings));
}

function hasFlag(home) {
  return fs.existsSync(path.join(home, '.claude', '.snaf-active'));
}

// --- mode=off branch ---

test('mode=off: removes flag, emits "OK", exits 0', () => {
  withTempHome(home => {
    writeMode(home, 'off');
    // Pre-create flag to verify removal.
    fs.writeFileSync(path.join(home, '.claude', '.snaf-active'), 'on');
    const r = runHook(home, { source: 'startup' });
    assert.equal(r.status, 0);
    assert.equal(r.stdout, 'OK');
    assert.equal(hasFlag(home), false);
  });
});

// --- mode=on: startup vs resume/compact ---

test('mode=on + source=startup: emits SKILL.md body with SNAF header', () => {
  withTempHome(home => {
    writeMode(home, 'on');
    const r = runHook(home, { source: 'startup' });
    assert.equal(r.status, 0);
    assert.match(r.stdout, /SNAF TRYB AKTYWNY/);
    assert.match(r.stdout, /Krux/);  // persona body
    assert.equal(hasFlag(home), true);
  });
});

test('mode=on + source=startup: strips YAML frontmatter from SKILL.md', () => {
  withTempHome(home => {
    writeMode(home, 'on');
    const r = runHook(home, { source: 'startup' });
    // The raw SKILL.md starts with "---\nname: snaf\n...\n---".
    // After the replace, the output should NOT contain `name: snaf`.
    assert.doesNotMatch(r.stdout, /^---\s*\nname:\s*snaf/m);
  });
});

test('mode=on + source=resume: emits short reminder (no full SKILL.md)', () => {
  withTempHome(home => {
    writeMode(home, 'on');
    const r = runHook(home, { source: 'resume' });
    assert.equal(r.status, 0);
    assert.match(r.stdout, /SNAF TRYB AKTYWNY/);
    assert.match(r.stdout, /persona Krux dalej działa/);
    // Full SKILL.md body (e.g., "PRAWO 1") should NOT be present.
    assert.doesNotMatch(r.stdout, /PRAWO 1/);
  });
});

test('mode=on + source=compact: emits short reminder', () => {
  withTempHome(home => {
    writeMode(home, 'on');
    const r = runHook(home, { source: 'compact' });
    assert.equal(r.status, 0);
    assert.match(r.stdout, /persona Krux dalej działa/);
    assert.doesNotMatch(r.stdout, /PRAWO 1/);
  });
});

test('mode=on + no source: defaults to startup behavior', () => {
  withTempHome(home => {
    writeMode(home, 'on');
    const r = runHook(home, {});
    assert.match(r.stdout, /SNAF TRYB AKTYWNY/);
    assert.match(r.stdout, /Krux/);
  });
});

test('mode=on + no stdin: defaults to startup', () => {
  withTempHome(home => {
    writeMode(home, 'on');
    const r = runHook(home, null);
    assert.match(r.stdout, /SNAF TRYB AKTYWNY/);
  });
});

// --- statusline copy + prompt ---

test('copies statusline script to ~/.claude/.snaf-statusline.sh on every activation', () => {
  withTempHome(home => {
    writeMode(home, 'on');
    runHook(home, { source: 'startup' });
    const expected = process.platform === 'win32'
      ? path.join(home, '.claude', '.snaf-statusline.ps1')
      : path.join(home, '.claude', '.snaf-statusline.sh');
    assert.equal(fs.existsSync(expected), true);
  });
});

test('first run without statusLine setting: emits setup prompt', () => {
  withTempHome(home => {
    writeMode(home, 'on');
    const r = runHook(home, { source: 'startup' });
    assert.match(r.stdout, /STATUSLINE SETUP NEEDED/);
    // Marker file should prevent future prompts.
    assert.equal(fs.existsSync(path.join(home, '.claude', '.snaf-statusline-asked')), true);
  });
});

test('second run: does NOT re-prompt for statusline setup', () => {
  withTempHome(home => {
    writeMode(home, 'on');
    runHook(home, { source: 'startup' });
    const r2 = runHook(home, { source: 'startup' });
    assert.doesNotMatch(r2.stdout, /STATUSLINE SETUP NEEDED/);
  });
});

test('existing non-snaf statusLine in settings: no prompt emitted', () => {
  withTempHome(home => {
    writeMode(home, 'on');
    writeSettings(home, { statusLine: { type: 'command', command: 'echo custom' } });
    const r = runHook(home, { source: 'startup' });
    assert.doesNotMatch(r.stdout, /STATUSLINE SETUP NEEDED/);
    assert.doesNotMatch(r.stdout, /STATUSLINE UPDATE AVAILABLE/);
  });
});

test('stale snaf statusline path: emits UPDATE AVAILABLE prompt', () => {
  withTempHome(home => {
    writeMode(home, 'on');
    writeSettings(home, {
      statusLine: { type: 'command', command: 'bash /old/cache/snaf-statusline.sh' }
    });
    const r = runHook(home, { source: 'startup' });
    assert.match(r.stdout, /STATUSLINE UPDATE AVAILABLE/);
  });
});

test('correct snaf statusline already set: no prompt', () => {
  withTempHome(home => {
    writeMode(home, 'on');
    const stablePath = process.platform === 'win32'
      ? path.join(home, '.claude', '.snaf-statusline.ps1')
      : path.join(home, '.claude', '.snaf-statusline.sh');
    const cmd = process.platform === 'win32'
      ? `powershell -ExecutionPolicy Bypass -File "${stablePath}"`
      : `bash "${stablePath}"`;
    writeSettings(home, { statusLine: { type: 'command', command: cmd } });
    const r = runHook(home, { source: 'startup' });
    assert.doesNotMatch(r.stdout, /STATUSLINE/);
  });
});

// --- flag persistence ---

test('mode=on writes flag with current mode value', () => {
  withTempHome(home => {
    writeMode(home, 'on');
    runHook(home, { source: 'startup' });
    const flag = path.join(home, '.claude', '.snaf-active');
    assert.equal(fs.existsSync(flag), true);
    assert.equal(fs.readFileSync(flag, 'utf8'), 'on');
  });
});

// --- env override ---

test('SNAF_DEFAULT_MODE=off env overrides .snaf-mode file', () => {
  withTempHome(home => {
    writeMode(home, 'on');
    const r = runHook(home, { source: 'startup' }, { SNAF_DEFAULT_MODE: 'off' });
    assert.equal(r.stdout, 'OK');
    assert.equal(hasFlag(home), false);
  });
});

test('malformed stdin: defaults to startup, does not crash', () => {
  withTempHome(home => {
    writeMode(home, 'on');
    const r = spawnSync('node', [HOOK], {
      input: 'not-json',
      env: { ...process.env, HOME: home, USERPROFILE: home },
      encoding: 'utf8',
      timeout: 5000,
    });
    assert.equal(r.status, 0);
    assert.match(r.stdout, /SNAF TRYB AKTYWNY/);
  });
});
