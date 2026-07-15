const EVENTS = new Set(['SessionStart', 'UserPromptSubmit', 'PostToolUse', 'SubagentStart']);

function collectStdin(onEnd) {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => { raw += chunk; });
  process.stdin.on('end', () => onEnd(raw));
}

function parsePayload(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

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

module.exports = { EVENTS, collectStdin, parsePayload, contextEnvelope, emitContext };
