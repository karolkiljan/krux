const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Writable } = require('node:stream');
const { parsePayload, contextEnvelope, emitContext } = require('../hooks/codex/hook-io');

test('parsePayload odrzuca malformed JSON', () => {
  assert.deepEqual(parsePayload('{"hook_event_name":"SessionStart"}'), {
    hook_event_name: 'SessionStart',
  });
  assert.equal(parsePayload('{'), null);
});

test('contextEnvelope wiąże dodatkowy kontekst z faktycznym eventem', () => {
  assert.deepEqual(contextEnvelope('SubagentStart', 'KRUX'), {
    hookSpecificOutput: {
      hookEventName: 'SubagentStart',
      additionalContext: 'KRUX',
    },
  });
});

test('contextEnvelope obsługuje lifecycle kontekstu, ale nie Stop', () => {
  for (const event of ['SessionStart', 'UserPromptSubmit', 'PostToolUse', 'SubagentStart']) {
    assert.equal(contextEnvelope(event, 'KRUX').hookSpecificOutput.hookEventName, event);
  }
  assert.throws(() => contextEnvelope('Stop', 'KRUX'), /Nieobsługiwany event/);
});

test('emitContext zapisuje dokładnie jeden natywny envelope', () => {
  let value = '';
  const output = new Writable({ write(chunk, encoding, callback) { value += chunk; callback(); } });
  emitContext('PostToolUse', 'KRUX CONTINUATION', output);
  assert.deepEqual(JSON.parse(value), contextEnvelope('PostToolUse', 'KRUX CONTINUATION'));
});
