#!/usr/bin/env node
// snaf — UserPromptSubmit toggle hook (cross-platform)
// Reads JSON payload from stdin, updates ~/.claude/.snaf-mode and .snaf-active.

const fs = require('fs');
const path = require('path');
const os = require('os');

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { raw += chunk; });
process.stdin.on('end', () => {
  let prompt = '';
  try {
    prompt = (JSON.parse(raw).prompt || '').trim();
  } catch (e) {
    process.exit(0);
  }
  if (!prompt) process.exit(0);

  const claudeDir = path.join(os.homedir(), '.claude');
  try { fs.mkdirSync(claudeDir, { recursive: true }); } catch (e) {}
  const modeFile = path.join(claudeDir, '.snaf-mode');
  const flag = path.join(claudeDir, '.snaf-active');

  // Polish diacritics optional — `wylacz snaf`, `wlacz snaf` also work.
  const offRe = /^(stop snaf|normalny tryb|wy(ł|l)(ą|a)cz snaf)$/iu;
  const onRe = /^(snaf|w(ł|l)(ą|a)cz snaf|start snaf|aktywuj snaf)$/iu;

  if (offRe.test(prompt)) {
    fs.writeFileSync(modeFile, 'off');
    try { fs.unlinkSync(flag); } catch (e) {}
  } else if (onRe.test(prompt)) {
    fs.writeFileSync(modeFile, 'on');
    try { fs.closeSync(fs.openSync(flag, 'w')); } catch (e) {}
  }
});
