// Tests for hooks/precompact.js — PreCompact hook.
// Injects {cwd}/.claude/compact_notes.md into PreCompact summary and deletes
// the file after use (one-shot notes).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const HOOK = path.join(__dirname, '..', 'hooks', 'precompact.js');

function withTempCwd(fn) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'snaf-pc-test-'));
  try { fn(cwd); } finally { fs.rmSync(cwd, { recursive: true, force: true }); }
}

function runHook(cwd, payload = {}, stdinOverride = null) {
  return spawnSync('node', [HOOK], {
    input: stdinOverride !== null ? stdinOverride : JSON.stringify({ cwd, ...payload }),
    env: { ...process.env },
    encoding: 'utf8',
    timeout: 5000,
  });
}

function writeNotes(cwd, content) {
  const notesDir = path.join(cwd, '.claude');
  fs.mkdirSync(notesDir, { recursive: true });
  const notesFile = path.join(notesDir, 'compact_notes.md');
  fs.writeFileSync(notesFile, content);
  return notesFile;
}

test('emits notes content on stdout when file exists', () => {
  withTempCwd(cwd => {
    const notesFile = writeNotes(cwd, 'Remember: keep auth refactor in flight.');
    const r = runHook(cwd);
    assert.equal(r.status, 0);
    assert.equal(r.stdout, 'Remember: keep auth refactor in flight.');
    assert.equal(fs.existsSync(notesFile), false, 'notes file should be consumed');
  });
});

test('trims whitespace before emitting', () => {
  withTempCwd(cwd => {
    writeNotes(cwd, '\n\n  content with padding  \n\n');
    const r = runHook(cwd);
    assert.equal(r.stdout, 'content with padding');
  });
});

test('no notes file: exit 0, no output', () => {
  withTempCwd(cwd => {
    const r = runHook(cwd);
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '');
  });
});

test('empty notes file: exit 0, no output, file IS deleted (one-shot contract)', () => {
  withTempCwd(cwd => {
    const notesFile = writeNotes(cwd, '   \n\n   ');
    const r = runHook(cwd);
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '');
    // One-shot: any existing file is consumed, including empty ones.
    assert.equal(fs.existsSync(notesFile), false);
  });
});

test('malformed stdin: exit 0 without crash', () => {
  withTempCwd(cwd => {
    writeNotes(cwd, 'should not be emitted');
    const r = runHook(cwd, {}, 'not-json');
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '');
  });
});

test('missing cwd in payload: falls back to process.cwd()', () => {
  withTempCwd(cwd => {
    // No notes in the test process cwd, so the hook should find nothing and exit 0.
    const r = spawnSync('node', [HOOK], {
      input: JSON.stringify({}),
      env: { ...process.env },
      cwd,
      encoding: 'utf8',
      timeout: 5000,
    });
    assert.equal(r.status, 0);
  });
});

test('multi-line notes are emitted intact (trimmed)', () => {
  withTempCwd(cwd => {
    const content = 'line 1\nline 2\n- bullet\n- another';
    writeNotes(cwd, content);
    const r = runHook(cwd);
    assert.equal(r.stdout, content);
  });
});

test('notes file deletion errors are swallowed (does not crash)', () => {
  withTempCwd(cwd => {
    // Make the notes directory read-only AFTER writing the file to block unlink.
    const notesFile = writeNotes(cwd, 'content');
    const notesDir = path.join(cwd, '.claude');
    const originalMode = fs.statSync(notesDir).mode;
    try {
      fs.chmodSync(notesDir, 0o500);  // read + execute only — can't unlink
      const r = runHook(cwd);
      assert.equal(r.status, 0);
      assert.equal(r.stdout, 'content');
    } finally {
      fs.chmodSync(notesDir, originalMode);  // restore for cleanup
      try { fs.unlinkSync(notesFile); } catch {}
    }
  });
});
