#!/usr/bin/env node
// krux — UserPromptSubmit toggle hook
// Reads JSON payload from stdin, updates <stateDir>/.krux-mode and .krux-active.

const fs = require('fs');
const path = require('path');
const { stateDir } = require('./lib/state-dir');
const { onPromptPayload, emitContext, stripFrontmatter } = require('./lib/hook-io');
const {
  buildTurnReminder,
  buildFullReminder,
  turnReminderEnabled,
  resetTurnCount,
  bumpTurnCount,
  nextMicroExample,
  markSessionActive,
  clearSessionActive,
  isSessionActive,
} = require('./lib/drift-guard');

onPromptPayload(({ prompt, sessionId }) => {
  const claudeDir = stateDir();
  try {
    fs.mkdirSync(claudeDir, { recursive: true });
  } catch (e) {
    console.error('[KRUX] mkdir ~/.claude failed:', e.message);
    process.exit(0);
  }
  const modeFile = path.join(claudeDir, '.krux-mode');
  const flag = path.join(claudeDir, '.krux-active');

  const personaBody = () => {
    const skillPath = path.join(__dirname, '..', 'skills', 'krux', 'SKILL.md');
    try {
      return stripFrontmatter(fs.readFileSync(skillPath, 'utf8'));
    } catch (e) {
      console.error('[KRUX] SKILL.md read failed:', e.message);
      return '';
    }
  };

  // Polish diacritics optional — `wylacz krux`, `wlacz krux` also work.
  // Both hosts spell explicit toggles: /krux:krux on|off (Claude), $krux:krux on|off (Codex).
  const oneShotRe = /^(\/|\$)krux:krux$/iu;
  const offRe = /^(stop krux|normalny tryb|wy(ł|l)(ą|a)cz krux|(\/|\$)krux:krux off)$/iu;
  const onRe = /^(krux|w(ł|l)(ą|a)cz krux|start krux|aktywuj krux|(\/|\$)krux:krux on)$/iu;

  if (oneShotRe.test(prompt)) {
    // One-shot loads the skill body through the slash-command channel — this is
    // a fresh reinforcement, so the drift-guard window restarts like any other.
    try { fs.closeSync(fs.openSync(flag, 'w')); } catch (e) {}
    markSessionActive(claudeDir, sessionId);
    resetTurnCount(claudeDir, sessionId);
  } else if (offRe.test(prompt)) {
    try { fs.writeFileSync(modeFile, 'off'); } catch (e) {
      console.error('[KRUX] write .krux-mode failed:', e.message);
      return;
    }
    try { fs.unlinkSync(flag); } catch (e) {}
    clearSessionActive(claudeDir, sessionId);
    resetTurnCount(claudeDir, sessionId);
    emitContext('KRUX PERSONA OFF. Odpowiadaj od tej wiadomości neutralną, zwięzłą polszczyzną. Nie stosuj łamanej gramatyki ani orkowego słownika. Flow zachowuje własny, niezależny stan.');
  } else if (onRe.test(prompt)) {
    try { fs.writeFileSync(modeFile, 'on'); } catch (e) {
      console.error('[KRUX] write .krux-mode failed:', e.message);
      return;
    }
    try { fs.closeSync(fs.openSync(flag, 'w')); } catch (e) {}
    markSessionActive(claudeDir, sessionId);
    resetTurnCount(claudeDir, sessionId);
    const body = personaBody();
    emitContext(body ? `KRUX PERSONA ON.\n\n${body}` : 'KRUX PERSONA ON. Stosuj odkrytą definicję skilla krux.');
  } else if (isSessionActive(claudeDir, sessionId)) {
    if (bumpTurnCount(claudeDir, sessionId)) {
      emitContext('KRUX DRIFT-GUARD — ' + buildFullReminder(nextMicroExample(claudeDir, sessionId)));
    } else if (turnReminderEnabled()) {
      emitContext('KRUX TURN — ' + buildTurnReminder(nextMicroExample(claudeDir, sessionId)));
    }
  }
});
