#!/usr/bin/env node
// krux — UserPromptSubmit toggle hook (cross-platform)
// Reads JSON payload from stdin, updates ~/.claude/.krux-mode and .krux-active.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { stateDir } = require('./lib/state-dir');

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

  const claudeDir = stateDir();
  try {
    fs.mkdirSync(claudeDir, { recursive: true });
  } catch (e) {
    console.error('[KRUX] mkdir ~/.claude failed:', e.message);
    process.exit(0);
  }
  const modeFile = path.join(claudeDir, '.krux-mode');
  const flag = path.join(claudeDir, '.krux-active');

  const emit = (additionalContext) => {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext,
      },
    }));
  };

  const personaBody = () => {
    const skillPath = path.join(__dirname, '..', 'skills', 'krux', 'SKILL.md');
    try {
      return fs.readFileSync(skillPath, 'utf8').replace(/^---[\s\S]*?---\s*/, '');
    } catch (e) {
      console.error('[KRUX] SKILL.md read failed:', e.message);
      return '';
    }
  };

  // Polish diacritics optional — `wylacz krux`, `wlacz krux` also work.
  const oneShotRe = /^\/krux:krux$/iu;
  const offRe = /^(stop krux|normalny tryb|wy(ł|l)(ą|a)cz krux)$/iu;
  const onRe = /^(krux|w(ł|l)(ą|a)cz krux|start krux|aktywuj krux)$/iu;

  if (oneShotRe.test(prompt)) {
    try { fs.closeSync(fs.openSync(flag, 'w')); } catch (e) {}
  } else if (offRe.test(prompt)) {
    try { fs.writeFileSync(modeFile, 'off'); } catch (e) {
      console.error('[KRUX] write .krux-mode failed:', e.message);
    }
    try { fs.unlinkSync(flag); } catch (e) {}
    emit('KRUX PERSONA OFF. Odpowiadaj od tej wiadomości neutralną, zwięzłą polszczyzną. Nie stosuj łamanej gramatyki ani orkowego słownika. Flow zachowuje własny, niezależny stan.');
  } else if (onRe.test(prompt)) {
    try { fs.writeFileSync(modeFile, 'on'); } catch (e) {
      console.error('[KRUX] write .krux-mode failed:', e.message);
    }
    try { fs.closeSync(fs.openSync(flag, 'w')); } catch (e) {}
    const body = personaBody();
    emit(body ? `KRUX PERSONA ON.\n\n${body}` : 'KRUX PERSONA ON. Stosuj odkrytą definicję skilla krux.');
  }
});
