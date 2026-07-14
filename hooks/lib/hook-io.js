#!/usr/bin/env node
// krux — wspólny plumbing wejścia/wyjścia hooków.
// Stan trybów zostaje w osobnych hookach (konwencja „nie mieszać logiki");
// tu mieszka tylko powtarzalna hydraulika: stdin, parse, emit, frontmatter.

function collectStdin(onEnd) {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => { raw += chunk; });
  process.stdin.on('end', () => onEnd(raw));
}

function parsePayload(raw) {
  try {
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

// Wzorzec hooków UserPromptSubmit: malformed stdin albo pusty prompt = cichy
// sukces (exit 0) — hook nie może wysypać promptu użytkownika.
function onPromptPayload(handler) {
  collectStdin(raw => {
    const payload = parsePayload(raw);
    if (!payload) process.exit(0);
    const prompt = (payload.prompt || '').trim();
    if (!prompt) process.exit(0);
    handler({ prompt, sessionId: payload.session_id, payload });
  });
}

function emitContext(additionalContext) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext,
    },
  }));
}

function stripFrontmatter(text) {
  return text.replace(/^---[\s\S]*?---\s*/, '');
}

module.exports = {
  collectStdin,
  parsePayload,
  onPromptPayload,
  emitContext,
  stripFrontmatter,
};
