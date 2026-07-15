#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { collectStdin, parsePayload, emitContext } = require('./hook-io');
const { stripFrontmatter } = require('../lib/hook-io');
const { classifyPersonaPrompt, getDefaultMode } = require('../lib/persona-mode');
const {
  buildTurnReminder,
  buildFullReminder,
  bumpTurnCount,
  nextMicroExample,
  markSessionActive,
  clearSessionActive,
  isSessionActive,
  resetTurnCount,
} = require('../lib/drift-guard');

const OFF_CONTEXT = 'KRUX PERSONA OFF. Odpowiadaj od tej wiadomości neutralną, zwięzłą polszczyzną. Nie stosuj łamanej gramatyki ani orkowego słownika. Flow zachowuje własny, niezależny stan.';

function skillBody() {
  try {
    return stripFrontmatter(fs.readFileSync(
      path.join(__dirname, '..', '..', 'skills', 'krux', 'SKILL.md'),
      'utf8',
    ));
  } catch (error) {
    console.error('[KRUX] native SKILL.md read failed:', error.message);
    return '';
  }
}

function fullReminder(dir, sid) {
  return `KRUX PERSONA ACTIVE. ${buildFullReminder(nextMicroExample(dir, sid))}`;
}

function handleSessionStart(dir, sid, source) {
  if (getDefaultMode(dir) === 'off') {
    clearSessionActive(dir, sid);
    resetTurnCount(dir, sid);
    return;
  }

  markSessionActive(dir, sid);
  resetTurnCount(dir, sid);
  if (source === 'resume') {
    emitContext('SessionStart', fullReminder(dir, sid));
    return;
  }

  const body = skillBody();
  if (body) emitContext('SessionStart', `KRUX PERSONA ACTIVE.\n\n${body}`);
}

function activatePrompt(dir, sid, persist) {
  if (persist) {
    try {
      fs.writeFileSync(path.join(dir, '.krux-mode'), 'on');
    } catch (error) {
      console.error('[KRUX] native write .krux-mode failed:', error.message);
      return;
    }
  }
  markSessionActive(dir, sid);
  resetTurnCount(dir, sid);
  emitContext('UserPromptSubmit', fullReminder(dir, sid));
}

function handlePrompt(dir, sid, rawPrompt) {
  const prompt = String(rawPrompt || '').trim();
  if (!prompt) return;
  const action = classifyPersonaPrompt(prompt);

  if (action === 'one-shot') {
    activatePrompt(dir, sid, false);
    return;
  }
  if (action === 'on') {
    activatePrompt(dir, sid, true);
    return;
  }
  if (action === 'off') {
    try {
      fs.writeFileSync(path.join(dir, '.krux-mode'), 'off');
    } catch (error) {
      console.error('[KRUX] native write .krux-mode failed:', error.message);
      return;
    }
    clearSessionActive(dir, sid);
    resetTurnCount(dir, sid);
    emitContext('UserPromptSubmit', OFF_CONTEXT);
    return;
  }

  if (!isSessionActive(dir, sid)) return;
  const example = nextMicroExample(dir, sid);
  const reminder = bumpTurnCount(dir, sid)
    ? buildFullReminder(example)
    : buildTurnReminder(example);
  emitContext('UserPromptSubmit', `KRUX TURN — ${reminder}`);
}

function handleSubagentStart(dir, sid) {
  if (!isSessionActive(dir, sid)) return;
  emitContext('SubagentStart', fullReminder(dir, sid));
}

collectStdin(raw => {
  const payload = parsePayload(raw);
  const dir = process.env.PLUGIN_DATA;
  if (!payload || !dir) return;

  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (error) {
    console.error('[KRUX] native state directory failed:', error.message);
    return;
  }

  const event = payload.hook_event_name;
  const sid = payload.session_id;
  if (event === 'SessionStart') {
    handleSessionStart(dir, sid, payload.source || 'startup');
  } else if (event === 'UserPromptSubmit') {
    handlePrompt(dir, sid, payload.prompt);
  } else if (event === 'SubagentStart') {
    handleSubagentStart(dir, sid);
  }
});
