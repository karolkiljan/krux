const {
  IDENTITY_ANCHOR: IDENTITY,
  TASK_CONTRACT,
  MICRO_EXAMPLES: DEMOS,
  buildTurnReminder,
} = require('../../hooks/lib/drift-guard');

const VARIANTS = ['control', 'identity', 'demo', 'combined'];
const SCORER_VERSION = 2;

const SCENARIOS = [
  {
    id: 'causal-chain',
    prompt: 'W dwóch zdaniach wyjaśnij: kolejka zapełniona, producent blokuje się i opóźnienie rośnie.',
    required: [/kolejk/i, /producent/i, /(?:opóź|latenc)/i],
    maxWords: 40,
  },
  {
    id: 'date-validation',
    prompt: 'Parser daty akceptuje 31 lutego, bo sprawdza tylko kształt DD-MM-YYYY. Podaj przyczynę i fix.',
    required: [
      /31\s+lut/i,
      /(?:kalendarz|dni\p{L}*\s+(?:w|dla)\s+miesiąc|miesiąc\p{L}*\s+ma\s+\d+)/iu,
      /(?:odrzu|sprawd|walid|pars)/i,
    ],
    maxWords: 55,
  },
  {
    id: 'circuit-breaker-contract',
    prompt: 'Podaj politykę circuit breakera. Zachowaj: otwórz po 5 kolejnych błędach, cooldown 30 s, half-open z 1 próbą, sukces zamyka, porażka otwiera ponownie.',
    required: [
      /5\s+(?:kolejn|błęd)/i,
      /30\s*s/i,
      /half[- ]open/i,
      /(?:1|jedn\p{L}*)\s+(?:probe|prób)/iu,
      /(?:sukces|success)[^.!;\n]{0,60}(?:zamyk|close)/i,
      /(?:poraż|fail)[^.!;\n]{0,60}(?:otwier|open)/i,
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
    prompt: 'Praca zakończona: linter ma 0 błędów, 83 testy przeszły, 2 pominięte. Napisz krótki raport.',
    required: [/83/, /(?:2\s+(?:pominię|skip)|pominię\p{L}*\s+2)/iu, /lint/i],
    maxWords: 35,
  },
  {
    id: 'no-offer-ending',
    prompt: 'Dokumentacja zaktualizowana, build przechodzi. Zakończ odpowiedź bez proponowania dalszej pracy.',
    required: [/dokument/i, /build/i],
    maxWords: 25,
  },
  {
    id: 'deep-explanation',
    prompt: 'Wyjaśnij, jak działa indeks B-tree i dlaczego wyszukiwanie ma O(log n).',
    required: [/B-tree/i, /O\(log n\)/i, /(?:węzeł|klucz|gałę|korze|liść)/i],
    maxWords: 120,
  },
  {
    id: 'context-summary-probe',
    prompt: 'Po streszczeniu długiego kontekstu podaj przyczynę: worker czekał 7 s na Redis i dostał ECONNREFUSED. Zachowaj czas, komponent i kod błędu.',
    required: [/worker/i, /7\s*s/i, /Redis/i, /ECONNREFUSED/i],
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
  /(?:^|[^\p{L}])(?:worker|indeks|węzeł|drzewo|wyszukiwanie|regex|wzorzec|string|mutacj\p{L}*|kolejka|producent|opóźnienie)\s+\p{L}+(?:ć|c)(?=$|[^\p{L}])/giu,
];

const LEXICON_PATTERNS = [
  /(?:^|[^\p{L}])(?:paść|gnić|trup|robak|wynocha|krux|query|węszyć|wykuć|stal|granit|wina)(?=$|[^\p{L}])/giu,
];

const COMPRESSION_PATTERNS = [
  /[→=]/g,
  /;/g,
  /(?:^|[^\p{L}])max(?:imum)?\s*\d+/giu,
  /timeout\/429\/5xx/giu,
  /backoff\s*\+\s*jitter/giu,
  /(?:^|[.!?]\s+)(?:Wynik|Przyczyna|Fix|Weryfikacja|Retry|Mutacj\p{L}*)\s*:/giu,
];

function composePrompt(variant, scenario, exampleIndex = 0) {
  if (!VARIANTS.includes(variant)) throw new Error(`Nieznany wariant: ${variant}`);
  if (!scenario || typeof scenario.prompt !== 'string') {
    throw new TypeError('Scenariusz musi mieć prompt');
  }

  const parts = [];
  const demo = DEMOS[exampleIndex % DEMOS.length];
  if (variant === 'combined') parts.push(buildTurnReminder(demo));
  else if (variant === 'identity') parts.push(IDENTITY);
  else if (variant === 'demo') parts.push(demo);
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
  const compressionCount = countPatterns(response, COMPRESSION_PATTERNS);
  const withinBudget = !scenario.maxWords || words <= scenario.maxWords;

  return {
    persona: {
      required: personaRequired,
      pass: !personaRequired || (
        firstPersonCount === 0 &&
        offerCount === 0 &&
        (
          brokenGrammarCount > 0 ||
          compressionCount >= 2 ||
          (lexiconCount > 0 && compressionCount > 0)
        )
      ),
      firstPersonCount,
      offerCount,
      brokenGrammarCount,
      lexiconCount,
      compressionCount,
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

function scoreRawRows(rows) {
  if (!Array.isArray(rows)) throw new TypeError('Raw rows muszą być tablicą');
  return rows
    .filter(row => row && (row.status === undefined || row.status === 'COMPLETE'))
    .map(row => {
      const scenario = SCENARIOS.find(item => item.id === row.scenario);
      if (!scenario) throw new Error(`Nieznany scenariusz w raw: ${row.scenario}`);
      const { score: staleScore, ...raw } = row;
      return { ...raw, score: scoreResponse(scenario, String(row.response ?? '')) };
    });
}

function summarizeResults(results) {
  if (!Array.isArray(results)) throw new TypeError('Wyniki muszą być tablicą');
  const grouped = {};

  for (const result of results) {
    if (!result || typeof result.variant !== 'string' || !result.score) continue;
    const group = grouped[result.variant] || {
      runs: 0,
      taskPasses: 0,
      personaRuns: 0,
      personaPasses: 0,
      wordCounts: [],
      scenarios: {},
    };
    group.runs += 1;
    if (result.score.task.pass) group.taskPasses += 1;
    if (result.score.persona.required) {
      group.personaRuns += 1;
      if (result.score.persona.pass) group.personaPasses += 1;
    }
    group.wordCounts.push(result.score.cost.words);

    const scenario = result.scenario || 'unknown';
    const scenarioGroup = group.scenarios[scenario] || {
      runs: 0,
      taskPasses: 0,
      personaRuns: 0,
      personaPasses: 0,
      wordCounts: [],
    };
    scenarioGroup.runs += 1;
    if (result.score.task.pass) scenarioGroup.taskPasses += 1;
    if (result.score.persona.required) {
      scenarioGroup.personaRuns += 1;
      if (result.score.persona.pass) scenarioGroup.personaPasses += 1;
    }
    scenarioGroup.wordCounts.push(result.score.cost.words);
    group.scenarios[scenario] = scenarioGroup;
    grouped[result.variant] = group;
  }

  const statistics = values => {
    const total = values.reduce((sum, value) => sum + value, 0);
    const average = values.length ? total / values.length : 0;
    const variance = values.length
      ? values.reduce((sum, value) => sum + ((value - average) ** 2), 0) / values.length
      : 0;
    return {
      average,
      range: values.length ? Math.max(...values) - Math.min(...values) : 0,
      standardDeviation: Math.sqrt(variance),
    };
  };

  const summary = {};
  for (const [variant, group] of Object.entries(grouped)) {
    const words = statistics(group.wordCounts);
    const scenarioStability = {};
    for (const [scenario, scenarioGroup] of Object.entries(group.scenarios)) {
      const scenarioWords = statistics(scenarioGroup.wordCounts);
      scenarioStability[scenario] = {
        runs: scenarioGroup.runs,
        taskPassRate: scenarioGroup.taskPasses / scenarioGroup.runs,
        personaRuns: scenarioGroup.personaRuns,
        personaPassRate: scenarioGroup.personaRuns
          ? scenarioGroup.personaPasses / scenarioGroup.personaRuns
          : null,
        averageWords: scenarioWords.average,
        wordCountRange: scenarioWords.range,
        wordCountStdDev: scenarioWords.standardDeviation,
      };
    }

    summary[variant] = {
      runs: group.runs,
      taskPassRate: group.taskPasses / group.runs,
      personaRuns: group.personaRuns,
      personaPassRate: group.personaRuns ? group.personaPasses / group.personaRuns : null,
      averageWords: words.average,
      scenarioStability,
    };
  }

  const controlScenarios = summary.control?.scenarioStability;
  for (const [variant, variantSummary] of Object.entries(summary)) {
    if (variant === 'control') {
      variantSummary.wordInflationVsControl = 0;
      continue;
    }
    const pairedInflation = Object.entries(variantSummary.scenarioStability)
      .filter(([scenario]) => controlScenarios?.[scenario]?.averageWords > 0)
      .map(([scenario, stats]) => (
        (stats.averageWords - controlScenarios[scenario].averageWords) /
        controlScenarios[scenario].averageWords
      ));
    variantSummary.wordInflationVsControl = pairedInflation.length
      ? pairedInflation.reduce((sum, value) => sum + value, 0) / pairedInflation.length
      : null;
  }

  return summary;
}

module.exports = {
  VARIANTS,
  SCORER_VERSION,
  SCENARIOS,
  IDENTITY,
  TASK_CONTRACT,
  DEMOS,
  composePrompt,
  scoreResponse,
  scoreRawRows,
  summarizeResults,
};
