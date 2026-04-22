// Tests for hooks/context_watch.js — Stop hook.
// Strategy: spawn hook with isolated HOME + temp transcript JSONL,
// feed session_id/transcript_path on stdin, assert stderr/exit/cooldown file.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const HOOK = path.join(__dirname, '..', 'hooks', 'context_watch.js');

function withTempEnv(fn) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'krux-cw-home-'));
  const sessDir = fs.mkdtempSync(path.join(os.tmpdir(), 'krux-cw-sess-'));
  try { fn(home, sessDir); }
  finally {
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(sessDir, { recursive: true, force: true });
  }
}

function writeTranscript(sessDir, lines) {
  const p = path.join(sessDir, 'transcript.jsonl');
  fs.writeFileSync(p, lines.map(l => typeof l === 'string' ? l : JSON.stringify(l)).join('\n') + '\n');
  return p;
}

function usageLine(total) {
  // Put total entirely in input_tokens for simplicity — hook sums all three fields.
  return { message: { usage: { input_tokens: total, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } };
}

function runHook(home, payload, extraEnv = {}) {
  // Strip ambient KRUX_* vars so tests aren't polluted by shell-level opt-outs.
  const cleanEnv = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (!k.startsWith('KRUX_')) cleanEnv[k] = v;
  }
  return spawnSync('node', [HOOK], {
    input: JSON.stringify(payload),
    env: { ...cleanEnv, HOME: home, USERPROFILE: home, ...extraEnv },
    encoding: 'utf8',
    timeout: 5000,
  });
}

// --- opt-out paths ---

test('KRUX_CONTEXT_WATCH=off disables watch cleanly (exit 0, no stderr)', () => {
  withTempEnv((home, sessDir) => {
    const transcript = writeTranscript(sessDir, [usageLine(200000)]);
    const r = runHook(home,
      { session_id: 's1', transcript_path: transcript },
      { KRUX_CONTEXT_WATCH: 'off' });
    assert.equal(r.status, 0);
    assert.equal(r.stderr, '');
  });
});

test('KRUX_CONTEXT_WATCH=OFF is case-insensitive', () => {
  withTempEnv((home, sessDir) => {
    const transcript = writeTranscript(sessDir, [usageLine(200000)]);
    const r = runHook(home,
      { session_id: 's1', transcript_path: transcript },
      { KRUX_CONTEXT_WATCH: 'OFF' });
    assert.equal(r.status, 0);
    assert.equal(r.stderr, '');
  });
});

test('.krux-mode=off disables watch entirely', () => {
  withTempEnv((home, sessDir) => {
    fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
    fs.writeFileSync(path.join(home, '.claude', '.krux-mode'), 'off');
    const transcript = writeTranscript(sessDir, [usageLine(200000)]);
    const r = runHook(home, { session_id: 's1', transcript_path: transcript });
    assert.equal(r.status, 0);
    assert.equal(r.stderr, '');
  });
});

test('.krux-context-watch-off file disables watch (keeps persona on)', () => {
  withTempEnv((home, sessDir) => {
    fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
    fs.closeSync(fs.openSync(path.join(home, '.claude', '.krux-context-watch-off'), 'w'));
    const transcript = writeTranscript(sessDir, [usageLine(200000)]);
    const r = runHook(home, { session_id: 's1', transcript_path: transcript });
    assert.equal(r.status, 0);
    assert.equal(r.stderr, '');
  });
});

test('.krux-context-watch-off empty file is enough (marker semantics)', () => {
  withTempEnv((home, sessDir) => {
    fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
    fs.writeFileSync(path.join(home, '.claude', '.krux-context-watch-off'), '');
    const transcript = writeTranscript(sessDir, [usageLine(200000)]);
    const r = runHook(home, { session_id: 's1', transcript_path: transcript });
    assert.equal(r.status, 0);
  });
});

// --- threshold behavior ---

test('tokens below default threshold (85000): no warning, exit 0', () => {
  withTempEnv((home, sessDir) => {
    const transcript = writeTranscript(sessDir, [usageLine(10000)]);
    const r = runHook(home, { session_id: 's1', transcript_path: transcript });
    assert.equal(r.status, 0);
    assert.equal(r.stderr, '');
  });
});

test('tokens above custom threshold: stderr warning + exit 2', () => {
  withTempEnv((home, sessDir) => {
    const transcript = writeTranscript(sessDir, [usageLine(50000)]);
    const r = runHook(home,
      { session_id: 's1', transcript_path: transcript },
      { KRUX_CONTEXT_THRESHOLD: '40000' });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /CONTEXT_WATCH/);
    assert.match(r.stderr, /50000/);
    assert.match(r.stderr, /40000/);
  });
});

test('tokens exactly at threshold: no warning (strict >)', () => {
  withTempEnv((home, sessDir) => {
    const transcript = writeTranscript(sessDir, [usageLine(40000)]);
    const r = runHook(home,
      { session_id: 's1', transcript_path: transcript },
      { KRUX_CONTEXT_THRESHOLD: '40000' });
    assert.equal(r.status, 0);
  });
});

test('.krux-context-threshold file overrides default threshold', () => {
  withTempEnv((home, sessDir) => {
    fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
    fs.writeFileSync(path.join(home, '.claude', '.krux-context-threshold'), '150000');
    // 100k would fire at default (85000) but NOT at file-override (150000).
    const transcript = writeTranscript(sessDir, [usageLine(100000)]);
    const r = runHook(home, { session_id: 's1', transcript_path: transcript });
    assert.equal(r.status, 0);
    assert.equal(r.stderr, '');
  });
});

test('.krux-context-threshold file beats env KRUX_CONTEXT_THRESHOLD', () => {
  withTempEnv((home, sessDir) => {
    fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
    fs.writeFileSync(path.join(home, '.claude', '.krux-context-threshold'), '200000');
    // Env says 40k (would fire at 50k), but file says 200k (would NOT fire at 50k).
    const transcript = writeTranscript(sessDir, [usageLine(50000)]);
    const r = runHook(home,
      { session_id: 's1', transcript_path: transcript },
      { KRUX_CONTEXT_THRESHOLD: '40000' });
    assert.equal(r.status, 0);
  });
});

test('.krux-context-threshold file with whitespace is trimmed', () => {
  withTempEnv((home, sessDir) => {
    fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
    fs.writeFileSync(path.join(home, '.claude', '.krux-context-threshold'), '\n  40000  \n');
    const transcript = writeTranscript(sessDir, [usageLine(50000)]);
    const r = runHook(home, { session_id: 's1', transcript_path: transcript });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /40000/);
  });
});

test('.krux-context-threshold garbage content falls back to env/default', () => {
  withTempEnv((home, sessDir) => {
    fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
    fs.writeFileSync(path.join(home, '.claude', '.krux-context-threshold'), 'not a number');
    const transcript = writeTranscript(sessDir, [usageLine(90000)]);
    const r = runHook(home, { session_id: 's1', transcript_path: transcript });
    // Default threshold (85000) wins → 90k > 85k → fires.
    assert.equal(r.status, 2);
    assert.match(r.stderr, /85000/);
  });
});

test('.krux-context-threshold zero or negative is rejected', () => {
  withTempEnv((home, sessDir) => {
    fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
    fs.writeFileSync(path.join(home, '.claude', '.krux-context-threshold'), '0');
    const transcript = writeTranscript(sessDir, [usageLine(90000)]);
    const r = runHook(home, { session_id: 's1', transcript_path: transcript });
    // 0 rejected → fallback to default 85000 → 90k > 85k → fires.
    assert.equal(r.status, 2);
    assert.match(r.stderr, /85000/);
  });
});

// --- transcript parsing ---

test('sums cache_read + cache_creation + input_tokens', () => {
  withTempEnv((home, sessDir) => {
    const transcript = writeTranscript(sessDir, [
      { message: { usage: {
        input_tokens: 10000,
        cache_read_input_tokens: 20000,
        cache_creation_input_tokens: 15000,
      } } }
    ]);
    const r = runHook(home,
      { session_id: 's1', transcript_path: transcript },
      { KRUX_CONTEXT_THRESHOLD: '40000' });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /45000/);
  });
});

test('reads top-level usage field (not only message.usage)', () => {
  withTempEnv((home, sessDir) => {
    const transcript = writeTranscript(sessDir, [
      { usage: { input_tokens: 50000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } }
    ]);
    const r = runHook(home,
      { session_id: 's1', transcript_path: transcript },
      { KRUX_CONTEXT_THRESHOLD: '40000' });
    assert.equal(r.status, 2);
  });
});

test('uses the LAST usage entry in transcript (freshest)', () => {
  withTempEnv((home, sessDir) => {
    const transcript = writeTranscript(sessDir, [
      usageLine(10000),
      usageLine(90000),  // last entry — should be picked
    ]);
    const r = runHook(home, { session_id: 's1', transcript_path: transcript });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /90000/);
  });
});

test('malformed JSONL lines are skipped, valid ones still parsed', () => {
  withTempEnv((home, sessDir) => {
    const transcript = writeTranscript(sessDir, [
      'not-json-at-all',
      '{"broken":',
      usageLine(90000),
      'garbage',
    ]);
    const r = runHook(home, { session_id: 's1', transcript_path: transcript });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /90000/);
  });
});

test('empty transcript: exits cleanly', () => {
  withTempEnv((home, sessDir) => {
    const p = path.join(sessDir, 'transcript.jsonl');
    fs.writeFileSync(p, '');
    const r = runHook(home, { session_id: 's1', transcript_path: p });
    assert.equal(r.status, 0);
  });
});

test('missing transcript file: exits cleanly', () => {
  withTempEnv((home) => {
    const r = runHook(home, { session_id: 's1', transcript_path: '/nonexistent/transcript.jsonl' });
    assert.equal(r.status, 0);
  });
});

test('missing session_id: exits cleanly', () => {
  withTempEnv((home, sessDir) => {
    const transcript = writeTranscript(sessDir, [usageLine(200000)]);
    const r = runHook(home, { transcript_path: transcript });
    assert.equal(r.status, 0);
  });
});

test('missing transcript_path: exits cleanly', () => {
  withTempEnv((home) => {
    const r = runHook(home, { session_id: 's1' });
    assert.equal(r.status, 0);
  });
});

// --- cooldown + delta ---

test('writes cooldown file with timestamp:tokens format after firing', () => {
  withTempEnv((home, sessDir) => {
    const transcript = writeTranscript(sessDir, [usageLine(90000)]);
    const r = runHook(home, { session_id: 's1', transcript_path: transcript });
    assert.equal(r.status, 2);
    const cooldownFile = path.join(sessDir, 's1.context_watch_ts');
    assert.ok(fs.existsSync(cooldownFile));
    const content = fs.readFileSync(cooldownFile, 'utf8').trim();
    assert.match(content, /^\d+(\.\d+)?:\d+$/);
    const [, tokens] = content.split(':');
    assert.equal(tokens, '90000');
  });
});

test('cooldown active + no delta growth: suppressed (exit 0)', () => {
  withTempEnv((home, sessDir) => {
    const transcript = writeTranscript(sessDir, [usageLine(90000)]);
    // First fire — writes cooldown
    const r1 = runHook(home, { session_id: 's1', transcript_path: transcript });
    assert.equal(r1.status, 2);
    // Second fire — same tokens, cooldown NOT elapsed → suppressed
    const r2 = runHook(home, { session_id: 's1', transcript_path: transcript });
    assert.equal(r2.status, 0);
    assert.equal(r2.stderr, '');
  });
});

test('cooldown active BUT delta satisfied: re-fires', () => {
  withTempEnv((home, sessDir) => {
    // First fire at 90k
    let transcript = writeTranscript(sessDir, [usageLine(90000)]);
    const r1 = runHook(home, { session_id: 's1', transcript_path: transcript });
    assert.equal(r1.status, 2);
    // Jump to 90k + 20k delta = 110k. Cooldown still active, but delta met.
    transcript = writeTranscript(sessDir, [usageLine(110000)]);
    const r2 = runHook(home, { session_id: 's1', transcript_path: transcript });
    assert.equal(r2.status, 2);
    assert.match(r2.stderr, /110000/);
  });
});

test('cooldown elapsed: re-fires regardless of delta', () => {
  withTempEnv((home, sessDir) => {
    const transcript = writeTranscript(sessDir, [usageLine(90000)]);
    const cooldownFile = path.join(sessDir, 's1.context_watch_ts');
    // Pre-seed an old cooldown (2 hours ago) with same tokens — delta = 0.
    const oldTs = Math.floor(Date.now() / 1000) - 7200;
    fs.writeFileSync(cooldownFile, `${oldTs}:90000`);
    const r = runHook(home, { session_id: 's1', transcript_path: transcript });
    assert.equal(r.status, 2);
  });
});

test('corrupt cooldown file does not crash hook (falls back to fresh fire)', () => {
  withTempEnv((home, sessDir) => {
    const transcript = writeTranscript(sessDir, [usageLine(90000)]);
    const cooldownFile = path.join(sessDir, 's1.context_watch_ts');
    fs.writeFileSync(cooldownFile, 'not:a:valid:timestamp:format');
    const r = runHook(home, { session_id: 's1', transcript_path: transcript });
    // Hook should parse prevTs=0 and fire normally.
    assert.equal(r.status, 2);
  });
});

// --- input edge cases ---

test('malformed stdin: exit 0 without crash', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'krux-cw-home-'));
  try {
    const r = spawnSync('node', [HOOK], {
      input: 'not-json',
      env: { ...process.env, HOME: home, USERPROFILE: home },
      encoding: 'utf8',
      timeout: 5000,
    });
    assert.equal(r.status, 0);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});
