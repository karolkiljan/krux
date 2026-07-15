#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { collectStdin, parsePayload, emitContext, stripFrontmatter } = require('./hook-io');
const {
  classifyPersonaPrompt,
  getDefaultMode,
  isStrictFormatPrompt,
} = require('../lib/persona-mode');
const {
  buildTurnReminder,
  buildFullReminder,
  MICRO_EXAMPLES,
  bumpTurnCount,
  nextMicroExample,
  markSessionActive,
  clearSessionActive,
  isSessionActive,
  resetTurnCount,
  markPromptTurn,
  shouldReinforceAfterTool,
  turnReminderEnabled,
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
  const example = sid ? nextMicroExample(dir, sid) : MICRO_EXAMPLES[0];
  return `KRUX PERSONA ACTIVE. ${buildFullReminder(example)}`;
}

function handleSessionStart(dir, sid, source) {
  if (getDefaultMode(dir) === 'off') {
    if (sid) {
      clearSessionActive(dir, sid);
      resetTurnCount(dir, sid);
    }
    return;
  }

  if (sid) {
    markSessionActive(dir, sid);
    resetTurnCount(dir, sid);
  }
  if (source === 'resume') {
    emitContext('SessionStart', fullReminder(dir, sid));
    return;
  }

  const body = skillBody();
  if (body) emitContext('SessionStart', `KRUX PERSONA ACTIVE.\n\n${body}`);
}

function activatePrompt(dir, sid, turnId, persist) {
  if (persist) {
    try {
      fs.writeFileSync(path.join(dir, '.krux-mode'), 'on');
    } catch (error) {
      console.error('[KRUX] native write .krux-mode failed:', error.message);
      return;
    }
  }
  if (sid) {
    markSessionActive(dir, sid);
    resetTurnCount(dir, sid);
    markPromptTurn(dir, sid, turnId, { strict: false });
  }
  emitContext('UserPromptSubmit', fullReminder(dir, sid));
}

function handlePrompt(dir, sid, turnId, rawPrompt) {
  const prompt = String(rawPrompt || '').trim();
  if (!prompt) return;
  const action = classifyPersonaPrompt(prompt);

  if (action === 'one-shot') {
    activatePrompt(dir, sid, turnId, false);
    return;
  }
  if (action === 'on') {
    activatePrompt(dir, sid, turnId, true);
    return;
  }
  if (action === 'off') {
    try {
      fs.writeFileSync(path.join(dir, '.krux-mode'), 'off');
    } catch (error) {
      console.error('[KRUX] native write .krux-mode failed:', error.message);
      return;
    }
    if (sid) {
      clearSessionActive(dir, sid);
      resetTurnCount(dir, sid);
    }
    emitContext('UserPromptSubmit', OFF_CONTEXT);
    return;
  }

  if (!sid || !isSessionActive(dir, sid)) return;
  // Tura zostaje oznaczona jako zakotwiczona nawet przy KRUX_TURN_REMINDER=0 —
  // opt-out ma wyciszyć lekkie kotwice, więc PostToolUse nie może ich
  // przemycić z powrotem przez dogrywkę pierwszego narzędzia.
  markPromptTurn(dir, sid, turnId, { strict: isStrictFormatPrompt(prompt) });
  if (bumpTurnCount(dir, sid)) {
    emitContext('UserPromptSubmit', `KRUX TURN — ${buildFullReminder(nextMicroExample(dir, sid))}`);
  } else if (turnReminderEnabled()) {
    emitContext('UserPromptSubmit', `KRUX TURN — ${buildTurnReminder(nextMicroExample(dir, sid))}`);
  }
}

function handleSubagentStart(dir, sid) {
  if (!sid || !isSessionActive(dir, sid)) return;
  emitContext('SubagentStart', fullReminder(dir, sid));
}

function handlePostToolUse(dir, sid, turnId) {
  if (!sid || !isSessionActive(dir, sid)) return;
  if (!shouldReinforceAfterTool(dir, sid, turnId)) return;
  emitContext(
    'PostToolUse',
    `KRUX CONTINUATION — ${buildTurnReminder(nextMicroExample(dir, sid))}`,
  );
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
    handlePrompt(dir, sid, payload.turn_id, payload.prompt);
  } else if (event === 'PostToolUse') {
    handlePostToolUse(dir, sid, payload.turn_id);
  } else if (event === 'SubagentStart') {
    handleSubagentStart(dir, sid);
  }
});
