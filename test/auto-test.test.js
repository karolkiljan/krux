// Tests for hooks/auto-test.js — PostToolUse odpalający npm test po zmianie
// hooks/*.js lub test/*.js.
//
// Strategia: tworzymy fałszywy repo "krux" z minimalnym package.json gdzie
// skrypt "test" to komenda którą kontrolujemy (echo albo exit 1). Tak można
// zweryfikować że hook:
//   - rozpoznaje strzeżone ścieżki,
//   - faktycznie wywołuje npm test,
//   - propaguje wynik (stdout/exit).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const HOOK = path.join(__dirname, '..', 'hooks', 'auto-test.js');

function withFakeRepo(fn, { name = 'krux', testScript = 'exit 0' } = {}) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'krux-at-test-'));
  try {
    fs.writeFileSync(
      path.join(cwd, 'package.json'),
      JSON.stringify({ name, version: '0.0.0', scripts: { test: testScript } }, null, 2)
    );
    fs.mkdirSync(path.join(cwd, 'hooks'), { recursive: true });
    fs.mkdirSync(path.join(cwd, 'test'), { recursive: true });
    fn(cwd);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
}

function stripKruxEnv(env) {
  const clean = { ...env };
  for (const k of Object.keys(clean)) {
    if (k.startsWith('KRUX_')) delete clean[k];
  }
  return clean;
}

function runHook(cwd, payload, stdinOverride = null, extraEnv = {}) {
  return spawnSync('node', [HOOK], {
    input: stdinOverride !== null ? stdinOverride : JSON.stringify({ cwd, ...payload }),
    env: { ...stripKruxEnv(process.env), ...extraEnv },
    encoding: 'utf8',
    timeout: 30000,
  });
}

test('zmiana w hooks/*.js → odpala npm test, sukces w stdout', () => {
  withFakeRepo(cwd => {
    const file = path.join(cwd, 'hooks', 'foo.js');
    fs.writeFileSync(file, '// noop');
    const r = runHook(cwd, {
      tool_name: 'Edit',
      tool_input: { file_path: file },
    });
    assert.equal(r.status, 0);
    assert.match(r.stdout, /przeszły/);
    assert.match(r.stdout, /hooks\/foo\.js/);
  });
});

test('zmiana w test/*.js → odpala npm test', () => {
  withFakeRepo(cwd => {
    const file = path.join(cwd, 'test', 'foo.test.js');
    fs.writeFileSync(file, '// noop');
    const r = runHook(cwd, {
      tool_name: 'Write',
      tool_input: { file_path: file },
    });
    assert.equal(r.status, 0);
    assert.match(r.stdout, /przeszły/);
  });
});

test('testy padają → hook raportuje PADŁY i tail', () => {
  withFakeRepo(cwd => {
    const file = path.join(cwd, 'hooks', 'bar.js');
    fs.writeFileSync(file, '// noop');
    const r = runHook(cwd, {
      tool_name: 'Edit',
      tool_input: { file_path: file },
    });
    assert.equal(r.status, 0);
    assert.match(r.stdout, /PADŁY/);
  }, { testScript: 'echo "boom" && exit 1' });
});

test('edycja poza hooks/ i test/ → nie odpala testów', () => {
  withFakeRepo(cwd => {
    const file = path.join(cwd, 'README.md');
    fs.writeFileSync(file, '# readme');
    const r = runHook(cwd, {
      tool_name: 'Edit',
      tool_input: { file_path: file },
    });
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '');
  }, { testScript: 'echo "should not run" && exit 1' });
});

test('edycja .md w hooks/ → odpala (matcher rozszerzony o .md/.json)', () => {
  withFakeRepo(cwd => {
    const file = path.join(cwd, 'hooks', 'README.md');
    fs.writeFileSync(file, '# hooks');
    const r = runHook(cwd, {
      tool_name: 'Edit',
      tool_input: { file_path: file },
    });
    assert.equal(r.status, 0);
    assert.match(r.stdout, /przeszły/);
  });
});

test('edycja agents/triggers.json → odpala (sync triggerów)', () => {
  withFakeRepo(cwd => {
    fs.mkdirSync(path.join(cwd, 'agents'), { recursive: true });
    const file = path.join(cwd, 'agents', 'triggers.json');
    fs.writeFileSync(file, '{}');
    const r = runHook(cwd, {
      tool_name: 'Edit',
      tool_input: { file_path: file },
    });
    assert.equal(r.status, 0);
    assert.match(r.stdout, /przeszły/);
  });
});

test('ETIMEDOUT przy przekroczeniu KRUX_AUTO_TEST_TIMEOUT_MS → komunikat TIMEOUT', () => {
  withFakeRepo(cwd => {
    const file = path.join(cwd, 'hooks', 'slow.js');
    fs.writeFileSync(file, '// noop');
    const r = runHook(cwd, {
      tool_name: 'Edit',
      tool_input: { file_path: file },
    }, null, { KRUX_AUTO_TEST_TIMEOUT_MS: '100' });
    assert.equal(r.status, 0);
    assert.match(r.stdout, /TIMEOUT/);
  }, { testScript: 'node -e "setTimeout(() => process.exit(0), 5000)"' });
});

test('cwd to nie repo krux (inne name) → nie odpala', () => {
  withFakeRepo(cwd => {
    const file = path.join(cwd, 'hooks', 'foo.js');
    fs.writeFileSync(file, '// noop');
    const r = runHook(cwd, {
      tool_name: 'Edit',
      tool_input: { file_path: file },
    });
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '');
  }, { name: 'other-project', testScript: 'echo "should not run" && exit 1' });
});

test('KRUX_AUTO_TEST=off → całkowity opt-out', () => {
  withFakeRepo(cwd => {
    const file = path.join(cwd, 'hooks', 'foo.js');
    fs.writeFileSync(file, '// noop');
    const r = runHook(cwd, {
      tool_name: 'Edit',
      tool_input: { file_path: file },
    }, null, { KRUX_AUTO_TEST: 'off' });
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '');
  }, { testScript: 'exit 1' });
});

test('nieznane tool_name (Read) → nic nie robi', () => {
  withFakeRepo(cwd => {
    const file = path.join(cwd, 'hooks', 'foo.js');
    fs.writeFileSync(file, '// noop');
    const r = runHook(cwd, {
      tool_name: 'Read',
      tool_input: { file_path: file },
    });
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '');
  }, { testScript: 'exit 1' });
});

test('malformed stdin → exit 0 bez crasha', () => {
  withFakeRepo(cwd => {
    const r = runHook(cwd, {}, 'not-json');
    assert.equal(r.status, 0);
  });
});

test('ścieżka względna hooks/foo.js → rozpoznana', () => {
  withFakeRepo(cwd => {
    fs.writeFileSync(path.join(cwd, 'hooks', 'foo.js'), '// noop');
    const r = runHook(cwd, {
      tool_name: 'Edit',
      tool_input: { file_path: 'hooks/foo.js' },
    });
    assert.equal(r.status, 0);
    assert.match(r.stdout, /przeszły/);
  });
});

test('brak tool_input → nic nie robi', () => {
  withFakeRepo(cwd => {
    const r = runHook(cwd, { tool_name: 'Edit' });
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '');
  }, { testScript: 'exit 1' });
});
