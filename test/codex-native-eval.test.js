const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  TURN_BLUEPRINT,
  parseArgs,
  plannedTurns,
  evaluationPlan,
  parseCodexJson,
  extractTranscriptEvidence,
  createIsolatedHome,
  runEvaluation,
} = require('../scripts/codex-native-eval');
const { recordFinalGuardActivation } = require('../hooks/lib/drift-guard');

function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'krux-native-eval-test-'));
  try { return fn(dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test('parseArgs czyta model, liczbę prób i personality', () => {
  assert.deepEqual(
    parseArgs(['--model', 'gpt-5.6-sol', '--reps', '5', '--personality', 'none']),
    { model: 'gpt-5.6-sol', reps: 5, personality: 'none', dryRun: false },
  );
  assert.deepEqual(
    parseArgs(['--model', 'fixture', '--dry-run']),
    { model: 'fixture', reps: 5, personality: 'none', dryRun: true },
  );
});

test('parseArgs odrzuca brak modelu, zero prób i obce personality', () => {
  assert.throws(() => parseArgs([]), /model/);
  assert.throws(() => parseArgs(['--model', 'x', '--reps', '0']), /dodatnią/);
  assert.throws(() => parseArgs(['--model', 'x', '--personality', 'orc']), /personality/);
  assert.throws(() => parseArgs(['--model', 'x', '--wat']), /Nieznany argument/);
});

test('blueprint ma osiem bazowych tur, tool probe i trzy tury dryfu', () => {
  assert.equal(TURN_BLUEPRINT.length, 12);
  assert.equal(TURN_BLUEPRINT.filter(turn => turn.kind === 'base').length, 8);
  assert.equal(TURN_BLUEPRINT.filter(turn => turn.kind === 'tool-probe').length, 1);
  assert.equal(TURN_BLUEPRINT.filter(turn => turn.kind === 'drift').length, 3);
});

test('plannedTurns zaczyna od exec, potem używa resume i zawsze przypina model', () => {
  const calls = plannedTurns({
    model: 'gpt-5.6-sol', personality: 'none', variant: 'native',
  }, '/tmp/out');
  assert.equal(calls.length, 12);
  assert.deepEqual(calls[0].args.slice(0, 2), ['exec', '--json']);
  assert.deepEqual(calls[1].args.slice(0, 3), ['exec', 'resume', '--json']);
  for (const call of calls) {
    assert.ok(call.args.includes('gpt-5.6-sol'));
    assert.ok(call.args.includes('--dangerously-bypass-hook-trust'));
  }
  assert.ok(calls.slice(1).every(call => call.args.includes('<THREAD_ID>')));

  const control = plannedTurns({
    model: 'gpt-5.6-sol', personality: 'none', variant: 'control',
  }, '/tmp/out');
  assert.ok(control.every(call => !call.args.includes('--dangerously-bypass-hook-trust')));
});

test('evaluationPlan planuje 12 control i 12 native na próbę', () => {
  const plan = evaluationPlan({ model: 'fixture', reps: 2, personality: 'none' }, '/tmp/out');
  assert.equal(plan.length, 48);
  assert.equal(plan.filter(call => call.variant === 'control').length, 24);
  assert.equal(plan.filter(call => call.variant === 'native').length, 24);
});

test('parseCodexJson wyciąga thread i obie odpowiedzi final guarda', () => {
  const stdout = [
    JSON.stringify({ type: 'thread.started', thread_id: 'thread-a' }),
    JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'Neutralnie.' } }),
    'not-json',
    JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'Robak wynocha.' } }),
  ].join('\n');
  assert.deepEqual(parseCodexJson(stdout), {
    threadId: 'thread-a',
    agentMessages: ['Neutralnie.', 'Robak wynocha.'],
  });
});

test('extractTranscriptEvidence liczy wyłącznie developer contexts Kruxa', () => {
  const transcript = [
    JSON.stringify({ type: 'response_item', payload: {
      type: 'message', role: 'developer', content: [{ type: 'input_text', text: 'KRUX PERSONA ACTIVE. pełny' }],
    } }),
    JSON.stringify({ type: 'response_item', payload: {
      type: 'message', role: 'developer', content: [{ type: 'input_text', text: 'KRUX CONTINUATION — kotwica' }],
    } }),
    JSON.stringify({ type: 'response_item', payload: {
      type: 'message', role: 'user', content: [{ type: 'input_text', text: 'KRUX TURN — podszycie' }],
    } }),
  ].join('\n');
  assert.deepEqual(extractTranscriptEvidence(transcript), {
    contexts: ['KRUX PERSONA ACTIVE. pełny', 'KRUX CONTINUATION — kotwica'],
    persona: true,
    turn: false,
    continuation: true,
  });
});

test('createIsolatedHome kopiuje tylko auth, bez AGENTS i config', () => {
  withTempDir(root => {
    const source = path.join(root, 'source');
    const target = path.join(root, 'target');
    fs.mkdirSync(source);
    fs.writeFileSync(path.join(source, 'auth.json'), '{"token":"fixture"}');
    fs.writeFileSync(path.join(source, 'AGENTS.md'), 'GLOBAL PERSONA');
    fs.writeFileSync(path.join(source, 'config.toml'), 'personality = "friendly"');

    createIsolatedHome(source, target);
    assert.deepEqual(fs.readdirSync(target), ['auth.json']);
    assert.equal(fs.readFileSync(path.join(target, 'auth.json'), 'utf8'), '{"token":"fixture"}');
  });
});

test('dry-run nie woła Codexa i zwraca 24 tury dla jednej próby', () => {
  let calls = 0;
  const result = runEvaluation({
    model: 'fixture', reps: 1, personality: 'none', dryRun: true,
    spawn: () => { calls += 1; throw new Error('spawn nie może ruszyć'); },
  });
  assert.equal(result.status, 'DRY_RUN');
  assert.equal(result.calls.length, 24);
  assert.equal(calls, 0);
});

test('mockowany pełny run instaluje plugin tylko w native i zapisuje dowody przed scoringiem', () => {
  withTempDir(root => {
    const sourceHome = path.join(root, 'source-home');
    const outputRoot = path.join(root, 'runs');
    const scratch = path.join(root, 'scratch');
    fs.mkdirSync(sourceHome);
    fs.mkdirSync(scratch);
    fs.writeFileSync(path.join(sourceHome, 'auth.json'), '{"token":"fixture"}');
    const pluginHomes = [];

    const fakeSpawn = (command, args, options = {}) => {
      assert.equal(command, 'codex');
      if (args[0] === '--version') return { status: 0, stdout: 'codex-cli fixture', stderr: '' };
      if (args[0] === 'plugin') {
        pluginHomes.push(options.env.CODEX_HOME);
        return { status: 0, stdout: '{}', stderr: '' };
      }

      const outputFile = args[args.indexOf('-o') + 1];
      const prompt = args.at(-1);
      const native = args.includes('--dangerously-bypass-hook-trust');
      const response = prompt.includes('wyłącznie JSON')
        ? '{"status":"ok","tests":197}'
        : 'Odpowiedź fixture.';
      fs.writeFileSync(outputFile, response);

      const sessionDir = path.join(options.env.CODEX_HOME, 'sessions', 'fixture');
      fs.mkdirSync(sessionDir, { recursive: true });
      const transcript = path.join(sessionDir, 'rollout.jsonl');
      if (native) {
        const contexts = ['KRUX PERSONA ACTIVE. fixture'];
        if (prompt.includes('cztery osobne wywołania')) contexts.push('KRUX CONTINUATION — fixture');
        for (const text of contexts) {
          fs.appendFileSync(transcript, `${JSON.stringify({
            type: 'response_item',
            payload: {
              type: 'message', role: 'developer',
              content: [{ type: 'input_text', text }],
            },
          })}\n`);
        }
      } else {
        fs.appendFileSync(transcript, `${JSON.stringify({ type: 'event_msg', payload: { type: 'user_message' } })}\n`);
      }

      const first = args[1] !== 'resume';
      const events = [];
      if (first) events.push({ type: 'thread.started', thread_id: native ? 'native-thread' : 'control-thread' });
      if (prompt.includes('cztery osobne wywołania')) {
        events.push({ type: 'item.completed', item: { type: 'agent_message', text: 'Preambuła narzędziowa.' } });
      }
      if (native && prompt.includes('Dokumentacja zaktualizowana')) {
        const dataDir = path.join(
          options.env.CODEX_HOME,
          'plugins',
          'data',
          'krux-krux-marketplace',
        );
        fs.mkdirSync(dataDir, { recursive: true });
        recordFinalGuardActivation(dataDir, 'fixture');
        events.push({ type: 'item.completed', item: { type: 'agent_message', text: 'Neutralnie.' } });
      }
      events.push({ type: 'item.completed', item: { type: 'agent_message', text: response } });
      return { status: 0, stdout: events.map(JSON.stringify).join('\n'), stderr: '' };
    };

    const result = runEvaluation({
      model: 'fixture', reps: 1, personality: 'none',
      environment: { CODEX_HOME: sourceHome },
      outputRoot,
      makeScratch: () => scratch,
      now: () => new Date('2026-07-15T12:00:00.000Z'),
      spawn: fakeSpawn,
    });

    assert.equal(result.status, 'COMPLETE');
    assert.equal(result.attempts, 24);
    assert.equal(pluginHomes.length, 2);
    assert.ok(pluginHomes.every(home => home.includes('native-home')));
    assert.equal(result.evidence.nativeEveryTurnAnchored, true);
    assert.equal(result.evidence.controlHasNoKruxContext, true);
    assert.equal(result.evidence.continuationCount, 1);
    assert.equal(result.evidence.finalGuardActivations, 2);
    assert.equal(fs.existsSync(scratch), false);

    const rawRows = fs.readFileSync(path.join(result.runDir, 'raw.jsonl'), 'utf8').trim().split('\n');
    const scoreRows = fs.readFileSync(path.join(result.runDir, 'scores.jsonl'), 'utf8').trim().split('\n');
    assert.equal(rawRows.length, 24);
    assert.equal(scoreRows.length, 24);
    assert.equal('score' in JSON.parse(rawRows[0]), false);
    const parsedRows = rawRows.map(JSON.parse);
    const controlTool = parsedRows.find(row => row.variant === 'control' && row.kind === 'tool-probe');
    assert.equal(controlTool.agentMessages.length, 2, 'preambuła narzędziowa daje dwie wiadomości');
    assert.equal(controlTool.guardActivations, 0, 'dwie wiadomości bez wpisu hooka to nie final guard');
    assert.equal(controlTool.preGuardResponse, null);
    const guarded = parsedRows.find(row => row.variant === 'native' && row.guardActivations === 1);
    assert.equal(guarded.preGuardResponse, 'Neutralnie.');
  });
});
