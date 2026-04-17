#!/usr/bin/env node
// snaf — Stop hook, watches context size via session transcript.
// Reads transcript_path + cwd from hook payload (no project_key reconstruction).

const fs = require('fs');
const path = require('path');

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { raw += chunk; });
process.stdin.on('end', () => {
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    process.exit(0);
  }

  const sessionId = data.session_id || '';
  const transcriptPath = data.transcript_path || '';
  if (!sessionId || !transcriptPath || !fs.existsSync(transcriptPath)) {
    process.exit(0);
  }

  const threshold = parseInt(process.env.SNAF_CONTEXT_THRESHOLD || '85000', 10);
  const cooldown = parseInt(process.env.SNAF_CONTEXT_COOLDOWN || '300', 10);

  const sessionDir = path.dirname(transcriptPath);
  const cooldownFile = path.join(sessionDir, sessionId + '.context_watch_ts');

  if (fs.existsSync(cooldownFile)) {
    try {
      const last = parseFloat(fs.readFileSync(cooldownFile, 'utf8').trim());
      if (Date.now() / 1000 - last < cooldown) process.exit(0);
    } catch (e) {}
  }

  // Read only the tail of the transcript — the freshest `usage` entry is always
  // near the end. Saves parsing MBs of JSONL each turn in long sessions.
  const TAIL_BYTES = 128 * 1024;
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

  let lastTokens = 0;
  for (const line of tail.split('\n')) {
    if (!line) continue;
    try {
      const d = JSON.parse(line);
      const usage = (d.message && d.message.usage) || d.usage;
      if (usage) {
        const total =
          (usage.cache_read_input_tokens || 0) +
          (usage.cache_creation_input_tokens || 0) +
          (usage.input_tokens || 0);
        if (total > 0) lastTokens = total;
      }
    } catch (e) {}
  }

  if (lastTokens > threshold) {
    try { fs.writeFileSync(cooldownFile, String(Date.now() / 1000)); } catch (e) {}
    process.stderr.write(
      `[CONTEXT_WATCH] Context osiągnął ${lastTokens} tokenów (próg: ${threshold}). ` +
      'Uruchom context watch protocol ze SKILL.md: wyświetl orkowy komunikat ' +
      'i zapytaj użytkownika co zachować przed /compact.\n'
    );
    process.exit(2);
  }
});
