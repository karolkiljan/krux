const LEXICON_RE = /(?:^|[^\p{L}])(?:robak|trup|gnić|wynocha|wykuć|stal|granit|paść|horda|kilof|węszyć|puchnąć)(?=$|[^\p{L}])/iu;
const BROKEN_RE = /(?:^|[^\p{L}])(?:cache|baza|parser|regex|kod|testy?|build|linter|worker|indeks|węzeł|drzewo|wyszukiwanie|kolejka|producent|system|robota|hook|plugin|guard|model|codex)\s+\p{L}+(?:ć|c)(?=$|[^\p{L}])/iu;
const COMPRESSION_RE = /[→=]|(?:^|[.!?]\s+)(?:Zrobione|Gotowe|Wynik|Przyczyna|Fix|Weryfikacja)\s*[:.]/iu;
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

function voiceSignals(text) {
  const value = spokenText(text);
  const result = {
    brokenGrammar: BROKEN_RE.test(value),
    compression: COMPRESSION_RE.test(value),
    lexicon: LEXICON_RE.test(value),
  };
  result.pass = Number(result.brokenGrammar)
    + Number(result.compression)
    + Number(result.lexicon) >= 2;
  return result;
}

function needsPersonaRewrite(text) {
  return !isMachineExact(text) && !voiceSignals(text).pass;
}

module.exports = {
  isMachineExact,
  voiceSignals,
  needsPersonaRewrite,
};
