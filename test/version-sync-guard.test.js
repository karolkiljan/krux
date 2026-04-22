// Tests for hooks/version-sync-guard.js — PreToolUse guard blokujący edycję
// package.json / plugin.json gdy wersje niezgodne.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const HOOK = path.join(__dirname, '..', 'hooks', 'version-sync-guard.js');

function withRepo(fn) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'krux-vsg-test-'));
  try { fn(cwd); } finally { fs.rmSync(cwd, { recursive: true, force: true }); }
}

function writeRepo(cwd, pkgVer, pluginVer) {
  if (pkgVer !== null) {
    fs.writeFileSync(path.join(cwd, 'package.json'), JSON.stringify({ version: pkgVer }, null, 2));
  }
  if (pluginVer !== null) {
    fs.mkdirSync(path.join(cwd, '.claude-plugin'), { recursive: true });
    fs.writeFileSync(
      path.join(cwd, '.claude-plugin', 'plugin.json'),
      JSON.stringify({ version: pluginVer }, null, 2)
    );
  }
}

function runHook(cwd, payload, stdinOverride = null) {
  return spawnSync('node', [HOOK], {
    input: stdinOverride !== null ? stdinOverride : JSON.stringify({ cwd, ...payload }),
    env: { ...process.env },
    encoding: 'utf8',
    timeout: 5000,
  });
}

test('zgodne wersje → pozwala edytować package.json (exit 0)', () => {
  withRepo(cwd => {
    writeRepo(cwd, '1.9.1', '1.9.1');
    const r = runHook(cwd, {
      tool_name: 'Edit',
      tool_input: { file_path: path.join(cwd, 'package.json') },
    });
    assert.equal(r.status, 0);
    assert.equal(r.stderr, '');
  });
});

test('rozjechane wersje → blokuje Edit (exit 2, stderr)', () => {
  withRepo(cwd => {
    writeRepo(cwd, '1.9.1', '1.9.0');
    const r = runHook(cwd, {
      tool_name: 'Edit',
      tool_input: { file_path: path.join(cwd, 'package.json') },
    });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /rozjechane/);
    assert.match(r.stderr, /1\.9\.1/);
    assert.match(r.stderr, /1\.9\.0/);
  });
});

test('rozjechane wersje → blokuje Write na plugin.json', () => {
  withRepo(cwd => {
    writeRepo(cwd, '2.0.0', '1.0.0');
    const r = runHook(cwd, {
      tool_name: 'Write',
      tool_input: { file_path: path.join(cwd, '.claude-plugin', 'plugin.json') },
    });
    assert.equal(r.status, 2);
  });
});

test('rozjechane wersje → blokuje MultiEdit', () => {
  withRepo(cwd => {
    writeRepo(cwd, '1.0.0', '2.0.0');
    const r = runHook(cwd, {
      tool_name: 'MultiEdit',
      tool_input: { file_path: path.join(cwd, 'package.json') },
    });
    assert.equal(r.status, 2);
  });
});

test('edycja niestrzeżonego pliku → exit 0 nawet przy rozjedzie', () => {
  withRepo(cwd => {
    writeRepo(cwd, '1.0.0', '2.0.0');
    const r = runHook(cwd, {
      tool_name: 'Edit',
      tool_input: { file_path: path.join(cwd, 'README.md') },
    });
    assert.equal(r.status, 0);
  });
});

test('nieznane tool_name → exit 0 (tylko Edit/Write/MultiEdit)', () => {
  withRepo(cwd => {
    writeRepo(cwd, '1.0.0', '2.0.0');
    const r = runHook(cwd, {
      tool_name: 'Read',
      tool_input: { file_path: path.join(cwd, 'package.json') },
    });
    assert.equal(r.status, 0);
  });
});

test('brak plugin.json → exit 0 (nie ten repo, nie blokuj)', () => {
  withRepo(cwd => {
    writeRepo(cwd, '1.0.0', null);
    const r = runHook(cwd, {
      tool_name: 'Edit',
      tool_input: { file_path: path.join(cwd, 'package.json') },
    });
    assert.equal(r.status, 0);
  });
});

test('brak package.json → exit 0', () => {
  withRepo(cwd => {
    writeRepo(cwd, null, '1.0.0');
    const r = runHook(cwd, {
      tool_name: 'Write',
      tool_input: { file_path: path.join(cwd, '.claude-plugin', 'plugin.json') },
    });
    assert.equal(r.status, 0);
  });
});

test('malformed stdin → exit 0 bez crasha', () => {
  withRepo(cwd => {
    writeRepo(cwd, '1.0.0', '2.0.0');
    const r = runHook(cwd, {}, 'not-json');
    assert.equal(r.status, 0);
  });
});

test('ścieżka względna strzeżonego pliku → rozpoznana', () => {
  withRepo(cwd => {
    writeRepo(cwd, '1.0.0', '2.0.0');
    const r = runHook(cwd, {
      tool_name: 'Edit',
      tool_input: { file_path: 'package.json' },
    });
    assert.equal(r.status, 2);
  });
});

test('package.json z uszkodzonym JSON → exit 0 (traktuj jak brak wersji)', () => {
  withRepo(cwd => {
    fs.writeFileSync(path.join(cwd, 'package.json'), 'not json');
    writeRepo(cwd, null, '1.0.0');
    const r = runHook(cwd, {
      tool_name: 'Edit',
      tool_input: { file_path: path.join(cwd, 'package.json') },
    });
    assert.equal(r.status, 0);
  });
});

test('brak tool_input → exit 0', () => {
  withRepo(cwd => {
    writeRepo(cwd, '1.0.0', '2.0.0');
    const r = runHook(cwd, { tool_name: 'Edit' });
    assert.equal(r.status, 0);
  });
});
