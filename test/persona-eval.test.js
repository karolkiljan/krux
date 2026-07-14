const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  VARIANTS,
  SCENARIOS,
  IDENTITY,
  TASK_CONTRACT,
  DEMOS,
  composePrompt,
  scoreResponse,
  summarizeResults,
} = require('../scripts/lib/persona-eval');
const {
  parseArgs,
  commandForHost,
  runEvaluation,
} = require('../scripts/persona-eval');

function scenario(id) {
  const found = SCENARIOS.find(item => item.id === id);
  assert.ok(found, `brak scenariusza ${id}`);
  return found;
}

function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'krux-persona-eval-test-'));
  try { return fn(dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test('benchmark ma kontrolę i trzy warianty kotwicy', () => {
  assert.deepEqual(VARIANTS, ['control', 'identity', 'demo', 'combined']);
  assert.ok(SCENARIOS.length >= 8, 'zestaw pokrywa minimum osiem powierzchni');
});

test('combined prompt zawiera tożsamość, dodatni wzorzec i kontrakt zadania', () => {
  const prompt = composePrompt('combined', scenario('email-validation'), 0);
  assert.match(prompt, /Krux = techniczny ork/);
  assert.match(prompt, /Wzorzec Krux:/);
  assert.match(prompt, /Wymagany format/);
  assert.match(prompt, /Zadanie:/);
  assert.doesNotMatch(prompt, /Nie:|ZAKAZ/);
});

test('warianty izolują badane składniki', () => {
  const item = scenario('causal-chain');
  const control = composePrompt('control', item);
  const identity = composePrompt('identity', item);
  const demo = composePrompt('demo', item);

  assert.doesNotMatch(control, new RegExp(IDENTITY));
  assert.doesNotMatch(control, /Wzorzec Krux:/);
  assert.match(identity, new RegExp(IDENTITY));
  assert.doesNotMatch(identity, /Wzorzec Krux:/);
  assert.doesNotMatch(demo, new RegExp(IDENTITY));
  assert.match(demo, /Wzorzec Krux:/);
  assert.doesNotMatch(demo, new RegExp(TASK_CONTRACT));
});

test('composePrompt waliduje wariant i rotuje dodatnie przykłady', () => {
  assert.throws(
    () => composePrompt('unknown', scenario('causal-chain')),
    /Nieznany wariant: unknown/
  );
  assert.notEqual(
    composePrompt('demo', scenario('causal-chain'), 0),
    composePrompt('demo', scenario('causal-chain'), 1)
  );
  for (const demo of DEMOS) {
    assert.match(demo, /^Wzorzec Krux:/);
    assert.doesNotMatch(demo, /Nie:|ZAKAZ|→ Krux:/);
  }
});

test('exact JSON ocenia zadanie osobno od persony', () => {
  const score = scoreResponse(
    scenario('exact-json'),
    '{"status":"ok","tests":197}'
  );
  assert.equal(score.task.pass, true);
  assert.equal(score.task.exactFormat, true);
  assert.equal(score.persona.required, false, 'ścisły format neutralizuje głos');
  assert.equal(score.persona.pass, true);
});

test('exact JSON odrzuca markdown, dodatkowy tekst i zły typ', () => {
  const item = scenario('exact-json');
  for (const response of [
    '```json\n{"status":"ok","tests":197}\n```',
    'Gotowe: {"status":"ok","tests":197}',
    '{"status":"ok","tests":"197"}',
  ]) {
    const score = scoreResponse(item, response);
    assert.equal(score.task.pass, false, response);
    assert.equal(score.task.exactFormat, false, response);
  }
});

test('retry score łapie każdy wymagany warunek', () => {
  const item = scenario('retry-contract');
  const complete = scoreResponse(
    item,
    'Retry tylko timeout/429/5xx, max 3, backoff + jitter; mutacja wymaga idempotency key.'
  );
  const truncated = scoreResponse(item, 'Retry max 3.');

  assert.equal(complete.task.pass, true);
  assert.equal(complete.task.requiredHits, complete.task.requiredTotal);
  assert.equal(truncated.task.pass, false);
  assert.ok(truncated.task.requiredHits < truncated.task.requiredTotal);
});

test('task score uznaje poprawne polskie odpowiedniki i Idempotency-Key', () => {
  const causal = scoreResponse(
    scenario('causal-chain'),
    'Pamięć podręczna jest pusta, więc każde zapytanie trafia do bazy. Baza jest przeciążona.'
  );
  const retry = scoreResponse(
    scenario('retry-contract'),
    'Tylko timeout/429/5xx. Maksymalnie 3 próby. Backoff + jitter. Mutacja: Idempotency-Key.'
  );
  assert.equal(causal.task.pass, true);
  assert.equal(retry.task.pass, true);
});

test('gładka odpowiedź przechodzi zadanie, ale oblewa personę', () => {
  const score = scoreResponse(
    scenario('causal-chain'),
    'Cache jest pusty, więc każde zapytanie trafia do bazy. Baza jest przeciążona.'
  );
  assert.equal(score.task.pass, true);
  assert.equal(score.persona.pass, false);
  assert.equal(score.persona.brokenGrammarCount, 0);
  assert.equal(score.persona.lexiconCount, 0);
});

test('zwięzła odpowiedź Kruxa przechodzi obie osie', () => {
  const score = scoreResponse(
    scenario('causal-chain'),
    'Cache pusty → każdy query w bazę → baza paść.'
  );
  assert.equal(score.task.pass, true);
  assert.equal(score.persona.pass, true);
  assert.ok(score.persona.brokenGrammarCount > 0);
  assert.ok(score.persona.lexiconCount > 0);
});

test('pierwsza osoba i oferta są raportowane jako osobne markery', () => {
  const score = scoreResponse(
    scenario('work-report'),
    'Zrobiłem pracę i mam 197 zielonych testów. Jeśli chcesz, mogę też przygotować PR.'
  );
  assert.ok(score.persona.firstPersonCount >= 2);
  assert.ok(score.persona.offerCount >= 1);
  assert.equal(score.persona.pass, false);
});

test('summarizeResults nie miesza persony z wykonaniem zadania', () => {
  const item = scenario('causal-chain');
  const results = [
    { variant: 'control', scenario: item.id, score: scoreResponse(item, 'Cache pusty. Baza przeciążona.') },
    { variant: 'combined', scenario: item.id, score: scoreResponse(item, 'Cache pusty → każdy query w bazę → baza paść.') },
    { variant: 'combined', scenario: item.id, score: scoreResponse(item, 'Cache pusty → ruch w bazę → baza paść.') },
  ];
  const summary = summarizeResults(results);

  assert.equal(summary.control.runs, 1);
  assert.equal(summary.control.taskPassRate, 1);
  assert.equal(summary.control.personaPassRate, 0);
  assert.equal(summary.combined.runs, 2);
  assert.equal(summary.combined.taskPassRate, 1);
  assert.equal(summary.combined.personaPassRate, 1);
  assert.equal(typeof summary.combined.averageWords, 'number');
  assert.equal(typeof summary.combined.wordCountRange, 'number');
});

test('parseArgs domyślnie wybiera pięć prób i wszystkie warianty', () => {
  assert.deepEqual(parseArgs(['--host', 'codex']), {
    host: 'codex',
    reps: 5,
    variant: 'all',
    dryRun: false,
  });
});

test('parseArgs waliduje host, wariant i dodatnią liczbę prób', () => {
  assert.throws(() => parseArgs([]), /Wymagane --host/);
  assert.throws(() => parseArgs(['--host', 'ollama']), /Nieznany host/);
  assert.throws(
    () => parseArgs(['--host', 'codex', '--variant', 'unknown']),
    /Nieznany wariant/
  );
  assert.throws(
    () => parseArgs(['--host', 'codex', '--reps', '0']),
    /dodatnią liczbą całkowitą/
  );
});

test('commandForHost buduje argv bez shell=true', () => {
  assert.deepEqual(commandForHost('codex', 'prompt', '/tmp/last.txt'), {
    command: 'codex',
    args: [
      'exec', '--ignore-user-config', '--ephemeral', '--skip-git-repo-check',
      '-s', 'read-only', '-o', '/tmp/last.txt', 'prompt',
    ],
    readsOutputFile: true,
  });
  assert.deepEqual(commandForHost('claude', 'prompt', '/tmp/last.txt'), {
    command: 'claude',
    args: [
      '--safe-mode', '-p', '--tools', '', '--no-session-persistence', 'prompt',
    ],
    readsOutputFile: false,
  });
});

test('run Codexa izoluje globalne AGENTS.md, ale zachowuje uwierzytelnienie', () => {
  withTempDir(outputRoot => {
    const sourceHome = path.join(outputRoot, 'source-codex-home');
    fs.mkdirSync(sourceHome);
    fs.writeFileSync(path.join(sourceHome, 'AGENTS.md'), 'ZAWSZE PERSONA GLOBALNA');
    fs.writeFileSync(path.join(sourceHome, 'auth.json'), '{"fixture":"auth"}');

    let isolatedHome;
    const result = runEvaluation({
      host: 'codex',
      reps: 1,
      variant: 'control',
      outputRoot,
      environment: { CODEX_HOME: sourceHome },
      spawn: (command, args, options) => {
        isolatedHome = options.env.CODEX_HOME;
        assert.match(isolatedHome, /krux-persona-eval-/);
        assert.notEqual(isolatedHome, sourceHome);
        assert.equal(fs.existsSync(path.join(isolatedHome, 'AGENTS.md')), false);
        assert.equal(
          fs.readFileSync(path.join(isolatedHome, 'auth.json'), 'utf8'),
          '{"fixture":"auth"}'
        );
        return { status: 0, stdout: '', stderr: '' };
      },
    });

    assert.equal(result.status, 'COMPLETE');
    assert.equal(fs.existsSync(isolatedHome), false, 'izolowany home usunięty po runie');
  });
});

test('brak binarki hosta daje SKIP, nigdy PASS', () => {
  const result = runEvaluation({
    host: 'codex',
    reps: 1,
    variant: 'control',
    spawn: () => ({
      status: null,
      error: { code: 'ENOENT', message: 'not found' },
      stdout: '',
      stderr: '',
    }),
  });
  assert.equal(result.status, 'SKIP');
  assert.notEqual(result.status, 'PASS');
  assert.match(result.reason, /codex/);
});

test('dry-run planuje świeży proces dla każdej próby i nic nie zapisuje', () => {
  withTempDir(outputRoot => {
    let spawnCalls = 0;
    const result = runEvaluation({
      host: 'codex',
      reps: 2,
      variant: 'all',
      dryRun: true,
      outputRoot,
      spawn: () => { spawnCalls += 1; throw new Error('spawn nie powinien ruszyć'); },
    });
    assert.equal(result.status, 'DRY_RUN');
    assert.equal(result.calls.length, 4 * 2 * SCENARIOS.length);
    assert.equal(spawnCalls, 0);
    assert.deepEqual(fs.readdirSync(outputRoot), []);
  });
});

test('udany run zapisuje raw przed raportem i zwraca COMPLETE', () => {
  withTempDir(outputRoot => {
    let spawnCalls = 0;
    const result = runEvaluation({
      host: 'claude',
      reps: 1,
      variant: 'control',
      outputRoot,
      now: () => new Date('2026-07-15T12:34:56.000Z'),
      spawn: () => {
        spawnCalls += 1;
        return { status: 0, stdout: 'Odpowiedź kontrolna', stderr: '' };
      },
    });
    assert.equal(result.status, 'COMPLETE');
    assert.equal(spawnCalls, SCENARIOS.length);
    assert.equal(result.results.length, SCENARIOS.length);
    const runDir = path.join(outputRoot, '2026-07-15T12-34-56-000Z-claude');
    assert.equal(fs.existsSync(path.join(runDir, 'raw.jsonl')), true);
    assert.equal(fs.existsSync(path.join(runDir, 'report.json')), true);
    const rows = fs.readFileSync(path.join(runDir, 'raw.jsonl'), 'utf8').trim().split('\n');
    assert.equal(rows.length, SCENARIOS.length);
    assert.equal(JSON.parse(rows[0]).response, 'Odpowiedź kontrolna');
  });
});

test('niezerowy exit hosta daje ERROR z zachowanym stderr', () => {
  const result = runEvaluation({
    host: 'claude',
    reps: 1,
    variant: 'control',
    spawn: () => ({ status: 2, stdout: '', stderr: 'auth failed' }),
  });
  assert.equal(result.status, 'ERROR');
  assert.equal(result.exitCode, 2);
  assert.match(result.reason, /auth failed/);
});

test('niezerowy exit hosta zachowuje diagnostykę ze stdout gdy stderr jest pusty', () => {
  const result = runEvaluation({
    host: 'claude',
    reps: 1,
    variant: 'control',
    spawn: () => ({
      status: 1,
      stdout: 'You have hit your session limit',
      stderr: '',
    }),
  });
  assert.equal(result.status, 'ERROR');
  assert.equal(result.exitCode, 1);
  assert.match(result.reason, /session limit/);
});
