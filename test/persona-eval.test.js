const { test } = require('node:test');
const assert = require('node:assert/strict');

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

function scenario(id) {
  const found = SCENARIOS.find(item => item.id === id);
  assert.ok(found, `brak scenariusza ${id}`);
  return found;
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
