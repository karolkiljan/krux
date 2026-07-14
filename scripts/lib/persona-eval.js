const VARIANTS = ['control', 'identity', 'demo', 'combined'];

const IDENTITY =
  'Krux = techniczny ork: wynik pierwszy, łamana gramatyka, prosty słownik, kompresja bez utraty faktów.';

const TASK_CONTRACT =
  'Wymagany format, struktura, kod oraz każdy warunek, przyczyna, ryzyko i wynik weryfikacji zostają dosłowne.';

const DEMOS = [
  'Wzorzec Krux: „Wina walidacja: regex przepuszczać pusty email. Fix: odrzucić pusty string przed regexem.”',
  'Wzorzec Krux: „Retry tylko timeout/429/5xx, max 3, backoff + jitter; mutacja wymaga idempotency key.”',
  'Wzorzec Krux: „Cache pusty → każdy query w bazę → baza paść.”',
  'Wzorzec Krux: „Zrobione. Testy zielone.”',
];

const SCENARIOS = [
  {
    id: 'causal-chain',
    prompt: 'W dwóch zdaniach wyjaśnij: cache pusty, każde zapytanie trafia do bazy i baza jest przeciążona.',
    required: [/cache/i, /baz/i],
    maxWords: 40,
  },
  {
    id: 'email-validation',
    prompt: 'Zdiagnozuj: regex walidacji email przepuszcza pusty string. Podaj przyczynę i fix.',
    required: [/regex/i, /pust/i, /(?:fix|odrzu|walid)/i],
    maxWords: 55,
  },
  {
    id: 'retry-contract',
    prompt: 'Podaj politykę retry. Zachowaj: tylko timeout/429/5xx, max 3, backoff+jitter, idempotency key dla mutacji.',
    required: [
      /timeout/i,
      /429/,
      /5xx/i,
      /(?:max(?:ymalnie)?\s*3|3\s*(?:próby|razy))/i,
      /backoff/i,
      /jitter/i,
      /idempotency key|klucz idempotency/i,
    ],
    maxWords: 55,
  },
  {
    id: 'exact-json',
    prompt: 'Zwróć wyłącznie JSON: {"status":"ok","tests":197}. Bez markdown.',
    required: [],
    exactJson: { status: 'ok', tests: 197 },
    personaExpected: false,
    maxWords: 1,
  },
  {
    id: 'work-report',
    prompt: 'Praca zakończona, 197 testów przeszło. Napisz krótki raport.',
    required: [/197/, /test/i],
    maxWords: 30,
  },
  {
    id: 'no-offer-ending',
    prompt: 'Naprawa gotowa, testy zielone. Zakończ odpowiedź bez proponowania dalszej pracy.',
    required: [/test/i],
    maxWords: 25,
  },
  {
    id: 'deep-explanation',
    prompt: 'Wyjaśnij, jak działa indeks B-tree i dlaczego wyszukiwanie ma O(log n).',
    required: [/B-tree/i, /O\(log n\)/i, /(?:węzeł|klucz|gałę|korze|liść)/i],
    maxWords: 120,
  },
  {
    id: 'post-compact-probe',
    prompt: 'Po streszczeniu długiej sesji podaj przyczynę: worker czekał 5 s na DNS i dostał timeout. Zachowaj konkretny czas i komponent.',
    required: [/worker/i, /5\s*s/i, /DNS/i, /timeout/i],
    maxWords: 45,
  },
];

const FIRST_PERSON_PATTERNS = [
  /(?:^|[^\p{L}])(?:ja|mam|zrobiłem|sprawdziłem|uważam|mogę|przygotowałem|naprawiłem)(?=$|[^\p{L}])/giu,
];

const OFFER_PATTERNS = [
  /jeśli chcesz/giu,
  /mogę też/giu,
  /daj znać/giu,
  /czy chcesz/giu,
];

const BROKEN_GRAMMAR_PATTERNS = [
  /(?:^|[^\p{L}])(?:cache|baza|regex|kod|testy?|krux)\s+(?:pusty|paść|gnić|siedzieć|widzieć|mieć|zielone|trup)(?=$|[^\p{L}])/giu,
  /(?:^|[^\p{L}])(?:wyciągnąć|odrzucić|sprawdzić|wykuć|dodać|usunąć)\s+(?:na|przed|po|z|do)(?=$|[^\p{L}])/giu,
];

const LEXICON_PATTERNS = [
  /(?:^|[^\p{L}])(?:paść|gnić|trup|robak|wynocha|krux|query|węszyć|wykuć|stal|granit)(?=$|[^\p{L}])/giu,
  /→/g,
];

function composePrompt(variant, scenario, exampleIndex = 0) {
  if (!VARIANTS.includes(variant)) throw new Error(`Nieznany wariant: ${variant}`);
  if (!scenario || typeof scenario.prompt !== 'string') {
    throw new TypeError('Scenariusz musi mieć prompt');
  }

  const parts = [];
  if (variant === 'identity' || variant === 'combined') parts.push(IDENTITY);
  if (variant === 'demo' || variant === 'combined') {
    parts.push(DEMOS[exampleIndex % DEMOS.length]);
  }
  if (variant === 'combined') parts.push(TASK_CONTRACT);
  parts.push(`Zadanie:\n${scenario.prompt}`);
  return parts.join('\n\n');
}

function countPatterns(text, patterns) {
  return patterns.reduce((total, pattern) => {
    const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
    const matcher = new RegExp(pattern.source, flags);
    return total + Array.from(text.matchAll(matcher)).length;
  }, 0);
}

function exactJsonMatches(text, expected) {
  if (typeof expected !== 'object' || expected === null) return true;
  const trimmed = text.trim();
  if (trimmed !== JSON.stringify(expected)) return false;
  try {
    return JSON.stringify(JSON.parse(trimmed)) === JSON.stringify(expected);
  } catch {
    return false;
  }
}

function wordCount(text) {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/u).length : 0;
}

function scoreResponse(scenario, response) {
  if (!scenario || typeof scenario !== 'object') throw new TypeError('Brak scenariusza');
  if (typeof response !== 'string') throw new TypeError('Odpowiedź musi być stringiem');

  const required = Array.isArray(scenario.required) ? scenario.required : [];
  const requiredMatches = required.map(pattern => new RegExp(pattern.source, pattern.flags).test(response));
  const requiredHits = requiredMatches.filter(Boolean).length;
  const exactFormat = exactJsonMatches(response, scenario.exactJson);
  const words = wordCount(response);
  const personaRequired = scenario.personaExpected !== false;
  const firstPersonCount = countPatterns(response, FIRST_PERSON_PATTERNS);
  const offerCount = countPatterns(response, OFFER_PATTERNS);
  const brokenGrammarCount = countPatterns(response, BROKEN_GRAMMAR_PATTERNS);
  const lexiconCount = countPatterns(response, LEXICON_PATTERNS);
  const withinBudget = !scenario.maxWords || words <= scenario.maxWords;

  return {
    persona: {
      required: personaRequired,
      pass: !personaRequired || (
        firstPersonCount === 0 &&
        offerCount === 0 &&
        brokenGrammarCount > 0 &&
        lexiconCount > 0 &&
        withinBudget
      ),
      firstPersonCount,
      offerCount,
      brokenGrammarCount,
      lexiconCount,
      withinBudget,
    },
    task: {
      pass: requiredHits === required.length && exactFormat,
      requiredHits,
      requiredTotal: required.length,
      requiredMatches,
      exactFormat,
    },
    cost: {
      words,
      characters: response.length,
    },
  };
}

function summarizeResults(results) {
  if (!Array.isArray(results)) throw new TypeError('Wyniki muszą być tablicą');
  const grouped = {};

  for (const result of results) {
    if (!result || typeof result.variant !== 'string' || !result.score) continue;
    const group = grouped[result.variant] || {
      runs: 0,
      taskPasses: 0,
      personaPasses: 0,
      wordCounts: [],
    };
    group.runs += 1;
    if (result.score.task.pass) group.taskPasses += 1;
    if (result.score.persona.pass) group.personaPasses += 1;
    group.wordCounts.push(result.score.cost.words);
    grouped[result.variant] = group;
  }

  const summary = {};
  for (const [variant, group] of Object.entries(grouped)) {
    const totalWords = group.wordCounts.reduce((total, value) => total + value, 0);
    const minWords = Math.min(...group.wordCounts);
    const maxWords = Math.max(...group.wordCounts);
    summary[variant] = {
      runs: group.runs,
      taskPassRate: group.taskPasses / group.runs,
      personaPassRate: group.personaPasses / group.runs,
      averageWords: totalWords / group.runs,
      wordCountRange: maxWords - minWords,
    };
  }
  return summary;
}

module.exports = {
  VARIANTS,
  SCENARIOS,
  IDENTITY,
  TASK_CONTRACT,
  DEMOS,
  composePrompt,
  scoreResponse,
  summarizeResults,
};
