const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const {
  VARIANTS,
  SCENARIOS,
  IDENTITY,
  TASK_CONTRACT,
  DEMOS,
  composePrompt,
  scoreResponse,
  scoreRawRows,
  summarizeResults,
} = require('../scripts/lib/persona-eval');
const {
  parseArgs,
  commandForHost,
  rescoreRun,
  runEvaluation,
} = require('../scripts/persona-eval');
const runtimeAnchor = require('../hooks/lib/drift-guard');

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
  const prompt = composePrompt('combined', scenario('date-validation'), 0);
  assert.match(prompt, /Krux = techniczny ork/);
  assert.match(prompt, /Wzorzec Krux:/);
  assert.match(prompt, /Wymagany format/);
  assert.match(prompt, /Zadanie:/);
  assert.doesNotMatch(prompt, /Nie:|ZAKAZ/);
});

test('benchmark reużywa dokładnie kotwicę wdrażaną przez runtime', () => {
  assert.equal(IDENTITY, runtimeAnchor.IDENTITY_ANCHOR);
  assert.equal(TASK_CONTRACT, runtimeAnchor.TASK_CONTRACT);
  assert.deepEqual(DEMOS, runtimeAnchor.MICRO_EXAMPLES);
  const item = scenario('date-validation');
  assert.equal(
    composePrompt('combined', item, 0),
    `${runtimeAnchor.buildTurnReminder(runtimeAnchor.MICRO_EXAMPLES[0])}\n\nZadanie:\n${item.prompt}`
  );
});

test('żaden runtime demo nie rozwiązuje scenariusza benchmarku', () => {
  for (const item of SCENARIOS) {
    for (const demo of DEMOS) {
      assert.equal(
        scoreResponse(item, demo).task.pass,
        false,
        `${item.id}: demo przecieka odpowiedź: ${demo}`
      );
    }
  }
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

test('kontrakt circuit breakera łapie każdy wymagany warunek', () => {
  const item = scenario('circuit-breaker-contract');
  const complete = scoreResponse(
    item,
    'Po 5 kolejnych błędach: open. Cooldown 30 s. Half-open: 1 próba. Sukces zamyka; porażka otwiera ponownie.'
  );
  const truncated = scoreResponse(item, 'Po 5 błędach otwórz circuit breaker.');

  assert.equal(complete.task.pass, true);
  assert.equal(complete.task.requiredHits, complete.task.requiredTotal);
  assert.equal(truncated.task.pass, false);
  assert.ok(truncated.task.requiredHits < truncated.task.requiredTotal);
});

test('task score uznaje pełny polski kontrakt circuit breakera', () => {
  const causal = scoreResponse(
    scenario('causal-chain'),
    'Kolejka jest pełna, więc producent blokuje się, a opóźnienie rośnie.'
  );
  const circuitBreaker = scoreResponse(
    scenario('circuit-breaker-contract'),
    'Po 5 kolejnych błędach otwórz. Cooldown 30 s. Half-open: jedna próba. Sukces zamyka, porażka otwiera ponownie.'
  );
  assert.equal(causal.task.pass, true);
  assert.equal(circuitBreaker.task.pass, true);
});

test('gładka odpowiedź przechodzi zadanie, ale oblewa personę', () => {
  const score = scoreResponse(
    scenario('causal-chain'),
    'Kolejka jest zapełniona, więc producent blokuje się, a opóźnienie rośnie.'
  );
  assert.equal(score.task.pass, true);
  assert.equal(score.persona.pass, false);
  assert.equal(score.persona.brokenGrammarCount, 0);
  assert.equal(score.persona.lexiconCount, 0);
});

test('zwięzła odpowiedź Kruxa przechodzi obie osie', () => {
  const score = scoreResponse(
    scenario('causal-chain'),
    'Kolejka pełna → producent blokować → opóźnienie rosnąć.'
  );
  assert.equal(score.task.pass, true);
  assert.equal(score.persona.pass, true);
  assert.ok(score.persona.brokenGrammarCount > 0);
  assert.ok(score.persona.compressionCount > 0);
});

test('kanoniczny Krux przechodzi personę przez łamaną gramatykę bez ozdobnej leksyki', () => {
  for (const response of [
    'Cache pusty. Baza przeciążona.',
    'Zrobione. Testy zielone.',
  ]) {
    const score = scoreResponse(scenario('no-offer-ending'), response);
    assert.equal(score.persona.pass, true, response);
    assert.ok(score.persona.brokenGrammarCount > 0, response);
    assert.equal(score.persona.lexiconCount, 0, response);
  }
});

test('jedna strzałka w gładkim zdaniu nie daje fałszywego PASS persony', () => {
  const score = scoreResponse(
    scenario('causal-chain'),
    'Kolejka jest pełna → producent blokuje się, dlatego opóźnienie rośnie.'
  );
  assert.equal(score.task.pass, true);
  assert.equal(score.persona.brokenGrammarCount, 0);
  assert.equal(score.persona.lexiconCount, 0);
  assert.equal(score.persona.compressionCount, 1);
  assert.equal(score.persona.pass, false);
});

test('jedno słowo z leksyki Kruxa nie daje fałszywego PASS persony', () => {
  const score = scoreResponse(
    scenario('causal-chain'),
    'Krux wyjaśnia, że kolejka jest pełna, producent blokuje się i opóźnienie rośnie.'
  );
  assert.equal(score.task.pass, true);
  assert.equal(score.persona.lexiconCount, 1);
  assert.equal(score.persona.compressionCount, 0);
  assert.equal(score.persona.pass, false);
});

test('powtórzone średniki w gładkiej prozie nie udają kompresji Kruxa', () => {
  const score = scoreResponse(
    scenario('causal-chain'),
    'Kolejka jest pełna; producent blokuje się; opóźnienie rośnie.'
  );
  assert.equal(score.task.pass, true);
  assert.equal(score.persona.compressionCount, 1);
  assert.equal(score.persona.pass, false);
});

test('pierwsza osoba przyszła blokuje PASS mimo markerów kompresji', () => {
  const score = scoreResponse(
    scenario('causal-chain'),
    'Wyjaśnię: kolejka pełna → producent blokuje się → opóźnienie rośnie.'
  );
  assert.equal(score.task.pass, true);
  assert.ok(score.persona.firstPersonCount > 0);
  assert.equal(score.persona.pass, false);
});

test('typowe formy pierwszej osoby w raporcie blokują PASS persony', () => {
  for (const response of [
    'Dodałem raport. Testy zielone.',
    'Opiszę wynik. Testy zielone.',
    'Przedstawię diagnozę. Testy zielone.',
  ]) {
    const score = scoreResponse(scenario('no-offer-ending'), response);
    assert.ok(score.persona.firstPersonCount > 0, response);
    assert.equal(score.persona.pass, false, response);
  }
});

test('kod i formuły nie nabijają markerów kompresji persony', () => {
  const score = scoreResponse(
    scenario('causal-chain'),
    'Kolejka jest pełna; producent blokuje się; opóźnienie rośnie.\n```js\nx = y; z = x;\n```'
  );
  assert.equal(score.task.pass, true);
  assert.equal(score.persona.compressionCount, 1);
  assert.equal(score.persona.pass, false);
});

test('etykieta i interpunkcja w gładkiej prozie nie dają PASS persony', () => {
  for (const [item, response] of [
    [scenario('context-summary-probe'), 'Przyczyna: worker czekał 7 s na Redis; połączenie dostało ECONNREFUSED.'],
    [scenario('date-validation'), 'Przyczyna: regex sprawdza format. Fix: parser ścisły odrzuca datę po normalizacji; dodaj testy.'],
  ]) {
    const score = scoreResponse(item, response);
    assert.equal(score.task.pass, true, response);
    assert.equal(score.persona.pass, false, response);
  }
});

test('każdy kanoniczny runtime demo przechodzi scorer persony', () => {
  for (const demo of DEMOS) {
    assert.equal(scoreResponse(scenario('no-offer-ending'), demo).persona.pass, true, demo);
  }
});

test('kanoniczny retry demo przechodzi przez wiele markerów kompresji', () => {
  const score = scoreResponse(scenario('circuit-breaker-contract'), DEMOS[3]);
  assert.equal(score.task.pass, false, 'demo nie może rozwiązać zadania circuit breakera');
  assert.ok(score.persona.compressionCount >= 2);
  assert.ok(score.persona.brokenGrammarCount > 0);
  assert.equal(score.persona.pass, true);
});

test('date task wymaga semantyki kalendarza, nie samego kształtu', () => {
  const score = scoreResponse(
    scenario('date-validation'),
    '31 lutego nie istnieje w kalendarzu. Fix: parser sprawdzić liczbę dni w miesiącu.'
  );
  assert.equal(score.task.pass, true);
  for (const response of [
    '31-02-2026 nie istnieje. Parser ścisły ma odrzucić datę po normalizacji.',
    '31 lutego jest poza kalendarzem. Sprawdź liczbę dni miesiąca i odrzuć.',
    'Regex sprawdza tylko kształt, nie poprawność daty. Odrzuć po normalizacji pól.',
  ]) {
    assert.equal(scoreResponse(scenario('date-validation'), response).task.pass, true, response);
  }
  assert.equal(
    scoreResponse(scenario('date-validation'), 'Regex sprawdza DD-MM-YYYY. Fix: popraw regex.').task.pass,
    false
  );
  assert.equal(
    scoreResponse(scenario('date-validation'), 'Normalizacja daty. Parsowanie naprawia problem.').task.pass,
    false
  );
});

test('task matchery akceptują polskie formy circuit breakera i raport z etykietami', () => {
  const circuit = scoreResponse(
    scenario('circuit-breaker-contract'),
    '5 kolejnych błędów → otwórz. Cooldown 30 s. Half-open: 1 próba. Sukces → zamknij. Porażka → otwórz ponownie.'
  );
  const report = scoreResponse(
    scenario('work-report'),
    'Linter: 0 błędów. Testy: 83 przeszły. Pominięte: 2.'
  );
  assert.equal(circuit.task.pass, true);
  assert.equal(report.task.pass, true);
});

test('persona i koszt są osobnymi osiami', () => {
  const response = Array(12).fill('Cache pusty → baza paść.').join(' ');
  const score = scoreResponse(scenario('causal-chain'), response);
  assert.equal(score.persona.withinBudget, false);
  assert.equal(score.persona.pass, true);
  assert.ok(score.cost.words > 40);
});

test('marker łamanej gramatyki łapie rzeczownik z bezokolicznikiem', () => {
  const score = scoreResponse(
    scenario('context-summary-probe'),
    'Przyczyna: worker czekać 7 s na Redis i dostać ECONNREFUSED.'
  );
  assert.equal(score.task.pass, true);
  assert.ok(score.persona.brokenGrammarCount > 0);
  assert.equal(score.persona.pass, true);
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
    {
      variant: 'control',
      scenario: item.id,
      score: scoreResponse(item, 'Kolejka jest pełna, producent blokuje się, opóźnienie rośnie.'),
    },
    { variant: 'combined', scenario: item.id, score: scoreResponse(item, 'Kolejka pełna → producent blokować → opóźnienie rosnąć.') },
    { variant: 'combined', scenario: item.id, score: scoreResponse(item, 'Kolejka pełna → producent stać → latencja rosnąć.') },
  ];
  const summary = summarizeResults(results);

  assert.equal(summary.control.runs, 1);
  assert.equal(summary.control.taskPassRate, 1);
  assert.equal(summary.control.personaPassRate, 0);
  assert.equal(summary.combined.runs, 2);
  assert.equal(summary.combined.taskPassRate, 1);
  assert.equal(summary.combined.personaPassRate, 1);
  assert.equal(typeof summary.combined.averageWords, 'number');
  assert.equal(typeof summary.combined.scenarioStability['causal-chain'].wordCountRange, 'number');
});

test('summary wyłącza neutralny JSON z mianownika persony i liczy inflację względem kontroli', () => {
  const causal = scenario('causal-chain');
  const exact = scenario('exact-json');
  const rows = [
    {
      variant: 'control', scenario: causal.id,
      score: scoreResponse(causal, 'Kolejka jest pełna, producent blokuje się, opóźnienie rośnie.'),
    },
    {
      variant: 'control', scenario: exact.id,
      score: scoreResponse(exact, '{"status":"ok","tests":197}'),
    },
    {
      variant: 'combined', scenario: causal.id,
      score: scoreResponse(causal, 'Kolejka→producent blokować; opóźnienie rosnąć.'),
    },
    {
      variant: 'combined', scenario: exact.id,
      score: scoreResponse(exact, '{"status":"ok","tests":197}'),
    },
  ];
  const summary = summarizeResults(rows);

  assert.equal(summary.control.personaRuns, 1);
  assert.equal(summary.control.personaPassRate, 0);
  assert.equal(summary.combined.personaRuns, 1);
  assert.equal(summary.combined.personaPassRate, 1);
  assert.ok(summary.combined.wordInflationVsControl < 0);
  assert.equal(summary.control.wordInflationVsControl, 0);
  assert.deepEqual(Object.keys(summary.combined.scenarioStability).sort(), [
    'causal-chain', 'exact-json',
  ]);
  assert.equal(
    typeof summary.combined.scenarioStability['causal-chain'].wordCountStdDev,
    'number'
  );
});

test('parseArgs domyślnie wybiera pięć prób i wszystkie warianty', () => {
  assert.deepEqual(parseArgs(['--host', 'codex', '--model', 'gpt-fixture']), {
    host: 'codex',
    reps: 5,
    variant: 'all',
    dryRun: false,
    model: 'gpt-fixture',
  });
});

test('parseArgs rozpoznaje ponowne scoringowanie bez uruchamiania hosta', () => {
  assert.deepEqual(parseArgs(['--rescore', '/tmp/run']), {
    host: undefined,
    reps: 5,
    variant: 'all',
    dryRun: false,
    rescore: '/tmp/run',
  });
});

test('parseArgs waliduje host, wariant i dodatnią liczbę prób', () => {
  assert.throws(() => parseArgs([]), /Wymagane --host/);
  assert.throws(() => parseArgs(['--host', 'ollama', '--model', 'x']), /Nieznany host/);
  assert.throws(() => parseArgs(['--host', 'codex']), /Wymagane --model/);
  assert.throws(
    () => parseArgs(['--host', 'codex', '--model', 'x', '--variant', 'unknown']),
    /Nieznany wariant/
  );
  assert.throws(
    () => parseArgs(['--host', 'codex', '--model', 'x', '--reps', '0']),
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
  assert.deepEqual(commandForHost('codex', 'prompt', '/tmp/last.txt', 'gpt-fixture').args.slice(-3), [
    '-m', 'gpt-fixture', 'prompt',
  ]);
  assert.deepEqual(commandForHost('claude', 'prompt', '/tmp/last.txt', 'claude-fixture').args.slice(-3), [
    '--model', 'claude-fixture', 'prompt',
  ]);
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
        assert.ok(options.maxBuffer >= 16 * 1024 * 1024, 'host może emitować duży stderr');
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
  withTempDir(outputRoot => {
    const result = runEvaluation({
      host: 'codex',
      reps: 1,
      variant: 'control',
      outputRoot,
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
    assert.equal(JSON.parse(fs.readFileSync(path.join(result.runDir, 'report.json'))).status, 'SKIP');
    const raw = JSON.parse(fs.readFileSync(path.join(result.runDir, 'raw.jsonl'), 'utf8'));
    assert.equal(raw.status, 'SKIP');
  });
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
      gitSha: 'abc123',
      model: 'claude-fixture',
      cliVersion: 'Claude fixture 1.0',
      spawn: () => {
        spawnCalls += 1;
        return { status: 0, stdout: 'Odpowiedź kontrolna', stderr: '' };
      },
    });
    assert.equal(result.status, 'COMPLETE');
    assert.equal(spawnCalls, SCENARIOS.length);
    assert.equal(result.results.length, SCENARIOS.length);
    const runDir = result.runDir;
    assert.match(
      path.basename(runDir),
      /^2026-07-15T12-34-56-000Z-claude-control-[A-Za-z0-9]+$/
    );
    assert.equal(fs.existsSync(path.join(runDir, 'raw.jsonl')), true);
    assert.equal(fs.existsSync(path.join(runDir, 'report.json')), true);
    const rows = fs.readFileSync(path.join(runDir, 'raw.jsonl'), 'utf8').trim().split('\n');
    assert.equal(rows.length, SCENARIOS.length);
    const raw = JSON.parse(rows[0]);
    assert.equal(raw.response, 'Odpowiedź kontrolna');
    assert.equal(raw.status, 'COMPLETE');
    assert.equal('score' in raw, false, 'raw nie może starzeć się razem ze scorerem');
    const scores = fs.readFileSync(path.join(runDir, 'scores.jsonl'), 'utf8').trim().split('\n');
    assert.equal(scores.length, SCENARIOS.length);
    assert.equal(JSON.parse(scores[0]).score.task.requiredTotal >= 0, true);
    const report = JSON.parse(fs.readFileSync(path.join(runDir, 'report.json'), 'utf8'));
    assert.equal(report.metadata.gitSha, 'abc123');
    assert.equal(report.metadata.model, 'claude-fixture');
    assert.equal(report.metadata.cliVersion, 'Claude fixture 1.0');
    assert.equal(typeof report.metadata.scorerVersion, 'number');
    assert.equal(report.metadata.scenarioSetVersion, 2);
  });
});

test('raw powstaje przed scoringiem odpowiedzi', () => {
  withTempDir(outputRoot => {
    let scoringCalls = 0;
    const result = runEvaluation({
      host: 'claude',
      reps: 1,
      variant: 'control',
      outputRoot,
      spawn: () => ({ status: 0, stdout: 'Odpowiedź', stderr: '' }),
      score: (item, response) => {
        scoringCalls += 1;
        const [runDir] = fs.readdirSync(outputRoot);
        const raw = fs.readFileSync(path.join(outputRoot, runDir, 'raw.jsonl'), 'utf8');
        assert.equal(raw.trim().split('\n').length, scoringCalls);
        const scoresPath = path.join(outputRoot, runDir, 'scores.jsonl');
        const persistedScores = fs.existsSync(scoresPath)
          ? fs.readFileSync(scoresPath, 'utf8').trim().split('\n').filter(Boolean).length
          : 0;
        assert.equal(persistedScores, scoringCalls - 1, 'score bieżącej próby jeszcze nie istnieje');
        return scoreResponse(item, response);
      },
    });
    assert.equal(result.status, 'COMPLETE');
    assert.equal(scoringCalls, SCENARIOS.length);
  });
});

test('równoczesne warianty tego samego hosta dostają osobne katalogi runu', () => {
  withTempDir(outputRoot => {
    const shared = {
      host: 'claude',
      reps: 1,
      outputRoot,
      now: () => new Date('2026-07-15T12:34:56.000Z'),
      spawn: () => ({ status: 0, stdout: 'Odpowiedź', stderr: '' }),
    };
    const identity = runEvaluation({ ...shared, variant: 'identity' });
    const demo = runEvaluation({ ...shared, variant: 'demo' });

    assert.notEqual(identity.runDir, demo.runDir);
    assert.deepEqual(
      fs.readFileSync(path.join(identity.runDir, 'raw.jsonl'), 'utf8')
        .trim().split('\n').map(line => JSON.parse(line).variant),
      Array(SCENARIOS.length).fill('identity')
    );
    assert.deepEqual(
      fs.readFileSync(path.join(demo.runDir, 'raw.jsonl'), 'utf8')
        .trim().split('\n').map(line => JSON.parse(line).variant),
      Array(SCENARIOS.length).fill('demo')
    );
  });
});

test('niezerowy exit hosta daje ERROR z zachowanym stderr', () => {
  withTempDir(outputRoot => {
    const result = runEvaluation({
      host: 'claude',
      reps: 1,
      variant: 'control',
      outputRoot,
      spawn: () => ({ status: 2, stdout: '', stderr: 'auth failed' }),
    });
    assert.equal(result.status, 'ERROR');
    assert.equal(result.exitCode, 2);
    assert.match(result.reason, /auth failed/);
    const raw = JSON.parse(fs.readFileSync(path.join(result.runDir, 'raw.jsonl'), 'utf8'));
    assert.equal(raw.status, 'ERROR');
    assert.equal(raw.error, 'auth failed');
    assert.equal('score' in raw, false);
    const report = JSON.parse(fs.readFileSync(path.join(result.runDir, 'report.json'), 'utf8'));
    assert.equal(report.status, 'ERROR');
    assert.equal(report.attempts, 1);
  });
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

test('błąd kopiowania auth kończy raportem ERROR i zawsze usuwa scratch', () => {
  withTempDir(root => {
    const outputRoot = path.join(root, 'runs');
    const sourceHome = path.join(root, 'source-home');
    const scratch = path.join(root, 'known-scratch');
    fs.mkdirSync(path.join(sourceHome, 'auth.json'), { recursive: true });
    fs.mkdirSync(scratch);

    const result = runEvaluation({
      host: 'codex',
      reps: 1,
      variant: 'control',
      outputRoot,
      environment: { CODEX_HOME: sourceHome },
      makeScratch: () => scratch,
      spawn: () => { throw new Error('spawn nie powinien ruszyć'); },
    });

    assert.equal(result.status, 'ERROR');
    assert.match(result.reason, /director|katalog|EISDIR|EINVAL|ENOTSUP/i);
    assert.equal(fs.existsSync(scratch), false);
    assert.equal(fs.existsSync(path.join(result.runDir, 'report.json')), true);
  });
});

test('scoreRawRows odtwarza wynik z raw i ignoruje stary score', () => {
  const item = scenario('causal-chain');
  const [rescored] = scoreRawRows([{
    status: 'COMPLETE',
    host: 'codex',
    variant: 'combined',
    scenario: item.id,
    repetition: 1,
    prompt: item.prompt,
    response: 'Kolejka→producent blokować; opóźnienie rosnąć.',
    exitCode: 0,
    score: { stale: true },
  }]);
  assert.equal(rescored.score.task.pass, true);
  assert.equal(rescored.score.persona.pass, true);
  assert.equal(rescored.score.stale, undefined);
});

test('scoreRawRows zachowuje kompatybilność ze starym zestawem scenariuszy', () => {
  const rows = scoreRawRows([
    {
      status: 'COMPLETE', host: 'codex', variant: 'control',
      scenario: 'email-validation', repetition: 1,
      prompt: 'Zadanie:\nZdiagnozuj: regex walidacji email przepuszcza pusty string. Podaj przyczynę i fix.',
      response: 'Regex dopuszcza pusty string. Fix: odrzuć pustą wartość przed walidacją.',
      exitCode: 0,
    },
    {
      status: 'COMPLETE', host: 'codex', variant: 'control',
      scenario: 'causal-chain', repetition: 1,
      prompt: 'Zadanie:\nW dwóch zdaniach wyjaśnij: cache pusty, każde zapytanie trafia do bazy i baza jest przeciążona.',
      response: 'Cache pusty → każde zapytanie trafia do bazy → baza przeciążona.',
      exitCode: 0,
    },
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows.every(row => row.score.task.pass), true);
});

test('rescoreRun regeneruje raport bez wywołania modelu', () => {
  withTempDir(runDir => {
    const item = scenario('causal-chain');
    fs.writeFileSync(path.join(runDir, 'raw.jsonl'), `${JSON.stringify({
      status: 'COMPLETE', host: 'codex', variant: 'combined', scenario: item.id,
      repetition: 1, prompt: item.prompt,
      response: 'Kolejka→producent blokować; opóźnienie rosnąć.', exitCode: 0,
    })}\n`);
    const sourceMetadata = {
      evaluatorVersion: 2, scorerVersion: 2, scenarioSetVersion: 2,
      gitSha: 'source-sha', model: 'gpt-source', cliVersion: 'codex source',
      generatedAt: '2026-07-15T00:00:00.000Z',
    };
    fs.writeFileSync(path.join(runDir, 'report.json'), JSON.stringify({
      status: 'COMPLETE', host: 'codex', metadata: sourceMetadata,
    }));
    const result = rescoreRun(runDir, {
      gitSha: 'new-sha', model: 'gpt-fixture', cliVersion: 'codex fixture',
      now: () => new Date('2026-07-15T01:00:00.000Z'),
    });
    assert.equal(result.status, 'COMPLETE');
    assert.equal(result.rescored, true);
    assert.equal(result.results.length, 1);
    assert.deepEqual(result.sourceMetadata, sourceMetadata);
    assert.equal(result.metadata.gitSha, 'source-sha');
    assert.equal(result.metadata.scorerGitSha, 'new-sha');
    assert.equal(result.metadata.rescoredAt, '2026-07-15T01:00:00.000Z');
    assert.equal(JSON.parse(fs.readFileSync(path.join(runDir, 'report.json'))).rescored, true);
    const persisted = JSON.parse(fs.readFileSync(path.join(runDir, 'scores.jsonl'), 'utf8'));
    assert.equal(persisted.score.persona.pass, true);
  });
});

test('rescoreRun zachowuje SKIP i nie uznaje pustego raw za COMPLETE', () => {
  withTempDir(root => {
    const skipDir = path.join(root, 'skip');
    const emptyDir = path.join(root, 'empty');
    fs.mkdirSync(skipDir);
    fs.mkdirSync(emptyDir);
    fs.writeFileSync(path.join(skipDir, 'raw.jsonl'), `${JSON.stringify({
      status: 'SKIP', host: 'codex', variant: 'control', scenario: 'causal-chain',
      repetition: 1, prompt: 'x', response: '', exitCode: null, error: 'brak hosta',
    })}\n`);
    fs.writeFileSync(path.join(emptyDir, 'raw.jsonl'), '');

    const skipped = rescoreRun(skipDir, { gitSha: 'sha' });
    const empty = rescoreRun(emptyDir, { gitSha: 'sha' });
    assert.equal(skipped.status, 'SKIP');
    assert.equal(skipped.results.length, 0);
    assert.equal(empty.status, 'ERROR');
    assert.match(empty.reason, /brak prób|pusty raw/i);
  });
});

test('CLI rescore przekazuje model, ale nie przypisuje raw bieżącego SHA ani czasu', () => {
  withTempDir(runDir => {
    const item = scenario('causal-chain');
    fs.writeFileSync(path.join(runDir, 'raw.jsonl'), `${JSON.stringify({
      status: 'COMPLETE', host: 'codex', variant: 'control', scenario: item.id,
      repetition: 1, prompt: item.prompt,
      response: 'Kolejka pełna → producent blokować → opóźnienie rosnąć.', exitCode: 0,
    })}\n`);
    const completed = spawnSync(process.execPath, [
      path.join(__dirname, '..', 'scripts', 'persona-eval.js'),
      '--rescore', runDir,
      '--model', 'source-model',
    ], { encoding: 'utf8' });
    assert.equal(completed.status, 0, completed.stderr);
    const report = JSON.parse(fs.readFileSync(path.join(runDir, 'report.json'), 'utf8'));
    assert.equal(report.metadata.model, 'source-model');
    assert.equal(report.metadata.gitSha, 'unknown');
    assert.equal(report.metadata.generatedAt, 'unknown');
    assert.notEqual(report.metadata.scorerGitSha, 'unknown');
    assert.notEqual(report.metadata.scorerGitSha, report.metadata.gitSha);
  });
});
