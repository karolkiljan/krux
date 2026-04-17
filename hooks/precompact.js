#!/usr/bin/env node
// snaf — PreCompact hook, injects {cwd}/.claude/compact_notes.md into summary.

const fs = require('fs');
const path = require('path');

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { raw += chunk; });
process.stdin.on('end', () => {
  let data = {};
  try { data = JSON.parse(raw); } catch (e) { process.exit(0); }

  const cwd = data.cwd || process.cwd();
  const notesFile = path.join(cwd, '.claude', 'compact_notes.md');

  if (!fs.existsSync(notesFile)) process.exit(0);

  let notes;
  try { notes = fs.readFileSync(notesFile, 'utf8').trim(); } catch (e) { process.exit(0); }
  if (!notes) process.exit(0);

  process.stdout.write(notes);
  try { fs.unlinkSync(notesFile); } catch (e) {}
});
