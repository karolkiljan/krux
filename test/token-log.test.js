const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const HOOK = path.join(__dirname, '..', 'hooks', 'token-log.js');

function stripKruxEnv(env) {
  const clean = { ...env };
  for (const k of Object.keys(clean)) {
    if (k.startsWith('KRUX_')) delete clean[k];
  }
  return clean;
}

function runHook(input, env = {}) {
  return spawnSync('node', [HOOK], {
    input: typeof input === 'string' ? input : JSON.stringify(input),
    env: { ...stripKruxEnv(process.env), ...env },
    encoding: 'utf8',
    timeout: 5000,
  });
}

function setupTmpHome() {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'krux-tlog-'));
  fs.mkdirSync(path.join(tmpHome, '.claude'), { recursive: true });
  return tmpHome;
}

test('zapisuje entry gdy transcript ma usage (message.usage)', () => {
  const home = setupTmpHome();
  try {
    const transcriptPath = path.join(home, 'transcript.jsonl');
    fs.writeFileSync(transcriptPath, JSON.stringify({
      message: { usage: { output_tokens: 100, input_tokens: 50, cache_read_input_tokens: 200 } }
    }) + '\n');
    fs.writeFileSync(path.join(home, '.claude', '.krux-mode'), 'on');

    const r = runHook(
      { session_id: 'sess1', transcript_path: transcriptPath },
      { HOME: home, USERPROFILE: home }
    );
    assert.equal(r.status, 0);

    const log = fs.readFileSync(
      path.join(home, '.claude', '.krux-token-log.jsonl'), 'utf8'
    ).trim();
    const entry = JSON.parse(log);
    assert.equal(entry.session_id, 'sess1');
    assert.equal(entry.krux_active, true);
    assert.equal(entry.output_tokens, 100);
    assert.equal(entry.input_tokens, 50);
    assert.equal(entry.cache_read, 200);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('skip gdy transcript nie istnieje', () => {
  const home = setupTmpHome();
  try {
    const r = runHook(
      { session_id: 'x', transcript_path: '/nieistnieje' },
      { HOME: home, USERPROFILE: home }
    );
    assert.equal(r.status, 0);
    assert.equal(fs.existsSync(path.join(home, '.claude', '.krux-token-log.jsonl')), false);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('malformed stdin → exit 0 cicho', () => {
  const r = runHook('not json');
  assert.equal(r.status, 0);
});

test('krux_active=false gdy mode=off (top-level usage)', () => {
  const home = setupTmpHome();
  try {
    const transcriptPath = path.join(home, 'transcript.jsonl');
    fs.writeFileSync(transcriptPath, JSON.stringify({
      usage: { output_tokens: 50 }
    }) + '\n');
    fs.writeFileSync(path.join(home, '.claude', '.krux-mode'), 'off');

    runHook(
      { session_id: 's', transcript_path: transcriptPath },
      { HOME: home, USERPROFILE: home }
    );
    const entry = JSON.parse(
      fs.readFileSync(path.join(home, '.claude', '.krux-token-log.jsonl'), 'utf8').trim()
    );
    assert.equal(entry.krux_active, false);
    assert.equal(entry.output_tokens, 50);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('append wiele linii — log rośnie', () => {
  const home = setupTmpHome();
  try {
    const transcriptPath = path.join(home, 'transcript.jsonl');
    fs.writeFileSync(transcriptPath, JSON.stringify({
      message: { usage: { output_tokens: 10 } }
    }) + '\n');
    fs.writeFileSync(path.join(home, '.claude', '.krux-mode'), 'on');

    runHook({ session_id: 'a', transcript_path: transcriptPath }, { HOME: home, USERPROFILE: home });
    runHook({ session_id: 'b', transcript_path: transcriptPath }, { HOME: home, USERPROFILE: home });

    const lines = fs.readFileSync(
      path.join(home, '.claude', '.krux-token-log.jsonl'), 'utf8'
    ).trim().split('\n');
    assert.equal(lines.length, 2);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});
