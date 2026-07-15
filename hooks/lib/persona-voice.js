const LEXICON_PATTERNS = [
  /(?:^|[^\p{L}])(?:robak|trup|gnić|wynocha|wykuć|stal|granit|paść|horda|kilof|węszyć|puchnąć|query|wina|robota|krux)(?=$|[^\p{L}])/giu,
];

const BROKEN_GRAMMAR_PATTERNS = [
  /(?:^|[^\p{L}])(?:cache|baza|regex|kod|testy?|kolejk\p{L}*|build|linter|dokumentacj\p{L}*|robota|system|plugin|hook|guard|model|codex|redis|dns)\s+(?:pust\p{L}*|pełn\p{L}*|paść|gnić|siedzieć|widzieć|mieć|zielon\p{L}*|czyst\p{L}*|śwież\p{L}*|trup|gotow\p{L}*|mocn\p{L}*|stabiln\p{L}*|nie\s+wstać|stoi\s+mocno)(?=$|[^\p{L}])/giu,
  /(?:^|[^\p{L}])(?:worker|indeks|węz\p{L}*|drzew\p{L}*|b-tree|circuit[- ]breaker|wyszukiwanie|regex|wzorzec|string|kod|mutacj\p{L}*|kolejk\p{L}*|producent|opóźn\p{L}*|walidacj\p{L}*|parser|build|linter|testy?|cache|baza|redis|dns|system|plugin|hook|guard|model|codex|robota)\s+(?:(?:nie|tylko|dodatkowo)\s+)?\p{L}+(?:ć|c)(?=$|[^\p{L}])/giu,
  /(?:^|[^\p{L}])(?:wyciągnąć|odrzucić|sprawdzić|wykuć|dodać|usunąć)\s+(?:na|przed|po|z|do)(?=$|[^\p{L}])/giu,
  /\bRetry\s+tylko\b/giu,
];

const COMPRESSION_PATTERNS = [
  /[→=]/g,
  /;/g,
  /(?:^|[^\p{L}])max(?:imum)?\s*\d+/giu,
  /timeout\/429\/5xx/giu,
  /backoff\s*\+\s*jitter/giu,
  /(?:^|[.!?]\s+)(?:Zrobione|Gotowe|Wynik|Przyczyna|Fix|Weryfikacja|Retry|Mutacj\p{L}*|Linter|Testy?|Build|Status)\s*[:.]/giu,
];
const CONVENTIONAL_COMMIT_RE = /^(?:build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test)(?:\([^\n)]+\))?!?: [^\n]+$/u;

function spokenText(text) {
  return String(text || '')
    .replace(/```[\s\S]*?(?:```|$)/g, ' ')
    .replace(/`[^`\n]*`/g, ' ');
}

function isMachineExact(text) {
  const value = String(text || '').trim();
  if (!value) return true;
  try {
    JSON.parse(value);
    return true;
  } catch {}
  if (/^```[\s\S]*```$/u.test(value)) return true;
  return CONVENTIONAL_COMMIT_RE.test(value);
}

function countPatterns(text, patterns) {
  return patterns.reduce((total, pattern) => {
    const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
    return total + Array.from(text.matchAll(new RegExp(pattern.source, flags))).length;
  }, 0);
}

function countPatternKinds(text, patterns) {
  return patterns.filter(pattern => new RegExp(pattern.source, pattern.flags).test(text)).length;
}

function voiceSignals(text) {
  const value = spokenText(text);
  const brokenGrammarCount = countPatterns(value, BROKEN_GRAMMAR_PATTERNS);
  const compressionCount = countPatternKinds(value, COMPRESSION_PATTERNS);
  const lexiconCount = countPatterns(value, LEXICON_PATTERNS);
  const result = {
    brokenGrammar: brokenGrammarCount > 0,
    compression: compressionCount > 0,
    lexicon: lexiconCount > 0,
    brokenGrammarCount,
    compressionCount,
    lexiconCount,
  };
  result.pass = result.brokenGrammar || (result.lexicon && result.compression);
  return result;
}

function needsPersonaRewrite(text) {
  return !isMachineExact(text) && !voiceSignals(text).pass;
}

module.exports = {
  BROKEN_GRAMMAR_PATTERNS,
  LEXICON_PATTERNS,
  COMPRESSION_PATTERNS,
  isMachineExact,
  voiceSignals,
  needsPersonaRewrite,
};
