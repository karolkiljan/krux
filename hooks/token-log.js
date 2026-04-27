#!/usr/bin/env node
// krux — Stop hook, loguje usage tokenów per turn do JSONL.
//
// Cel: dane do walidacji deklarowanej oszczędności (~55%) i regresji.
// Rozdziel na turns z krux=on i krux=off — porównanie da realny pomiar.
//
// Format linii: { ts, session_id, krux_active, output_tokens, input_tokens,
//                 cache_read, cache_create }
// Plik: ~/.claude/.krux-token-log.jsonl (append-only, jeden zapis per Stop)
//
// Tail-only parsing transcriptu (wzorzec z context_watch.js).

const fs = require('fs');
const path = require('path');
const os = require('os');

const TAIL_BYTES = 64 * 1024;

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { raw += chunk; });
process.stdin.on('end', () => {
  let data;
  try { data = JSON.parse(raw); } catch (e) { process.exit(0); }

  const transcriptPath = data.transcript_path || '';
  const sessionId = data.session_id || '';
  if (!transcriptPath || !fs.existsSync(transcriptPath)) process.exit(0);

  let tail = '';
  try {
    const stat = fs.statSync(transcriptPath);
    const start = Math.max(0, stat.size - TAIL_BYTES);
    const fd = fs.openSync(transcriptPath, 'r');
    const len = stat.size - start;
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, start);
    fs.closeSync(fd);
    tail = buf.toString('utf8');
    if (start > 0) {
      const nl = tail.indexOf('\n');
      if (nl >= 0) tail = tail.slice(nl + 1);
    }
  } catch (e) {
    process.exit(0);
  }

  let lastUsage = null;
  for (const line of tail.split('\n')) {
    if (!line) continue;
    try {
      const d = JSON.parse(line);
      const u = (d.message && d.message.usage) || d.usage;
      if (u) lastUsage = u;
    } catch (e) {}
  }
  if (!lastUsage) process.exit(0);

  const claudeDir = path.join(os.homedir(), '.claude');
  let kruxActive = false;
  try {
    const mode = fs.readFileSync(
      path.join(claudeDir, '.krux-mode'), 'utf8'
    ).trim().toLowerCase();
    kruxActive = mode === 'on';
  } catch (e) {}

  const entry = {
    ts: Date.now(),
    session_id: sessionId,
    krux_active: kruxActive,
    output_tokens: lastUsage.output_tokens || 0,
    input_tokens: lastUsage.input_tokens || 0,
    cache_read: lastUsage.cache_read_input_tokens || 0,
    cache_create: lastUsage.cache_creation_input_tokens || 0,
  };

  const logFile = path.join(claudeDir, '.krux-token-log.jsonl');
  try {
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.appendFileSync(logFile, JSON.stringify(entry) + '\n');
  } catch (e) {}

  process.exit(0);
});
