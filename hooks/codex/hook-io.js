// krux — transport natywnych eventów Codexa. Czysta hydraulika (stdin, parse,
// frontmatter) pochodzi ze wspólnego rdzenia hooks/lib/hook-io; tu żyje tylko
// envelope eventów kontekstowych Codexa. Stop nie przechodzi przez emitContext —
// persona-stop.js zwraca natywne decision/reason bez hookSpecificOutput.
const { collectStdin, parsePayload, stripFrontmatter } = require('../lib/hook-io');

const EVENTS = new Set(['SessionStart', 'UserPromptSubmit', 'PostToolUse', 'SubagentStart']);

function contextEnvelope(event, text) {
  if (!EVENTS.has(event)) throw new Error(`Nieobsługiwany event Codexa: ${event}`);
  return {
    hookSpecificOutput: {
      hookEventName: event,
      additionalContext: text,
    },
  };
}

function emitContext(event, text, output = process.stdout) {
  output.write(JSON.stringify(contextEnvelope(event, text)));
}

module.exports = {
  EVENTS,
  collectStdin,
  parsePayload,
  stripFrontmatter,
  contextEnvelope,
  emitContext,
};
