const fs = require('fs');
const path = require('path');

const VALID_MODES = ['on', 'off'];
const ONE_SHOT_RE = /^(\/|\$)krux:krux$/iu;
const OFF_RE = /^(stop krux|normalny tryb|wy(ł|l)(ą|a)cz krux|(\/|\$)krux:krux off)$/iu;
const ON_RE = /^(krux|w(ł|l)(ą|a)cz krux|start krux|aktywuj krux|(\/|\$)krux:krux on)$/iu;
const STRICT_FORMAT_RE = /(?:zwróć|odpowiedz|wypisz|podaj|return)[^\n]{0,80}(?:wyłącznie|tylko|only|in)[^\n]{0,40}(?:json|kod|code|yaml|xml|exact format)|bez markdown|without markdown|commit message|conventional commit|opis PR|pull request description|dokładny format|exact format/iu;

function classifyPersonaPrompt(prompt) {
  const value = String(prompt || '').trim();
  if (ONE_SHOT_RE.test(value)) return 'one-shot';
  if (OFF_RE.test(value)) return 'off';
  if (ON_RE.test(value)) return 'on';
  return null;
}

function getDefaultMode(dir, env = process.env) {
  try {
    const mode = fs.readFileSync(path.join(dir, '.krux-mode'), 'utf8').trim().toLowerCase();
    if (VALID_MODES.includes(mode)) return mode;
  } catch {}

  const envMode = String(env.KRUX_DEFAULT_MODE || '').toLowerCase();
  return VALID_MODES.includes(envMode) ? envMode : 'on';
}

function isStrictFormatPrompt(prompt) {
  return STRICT_FORMAT_RE.test(String(prompt || ''));
}

module.exports = {
  VALID_MODES,
  classifyPersonaPrompt,
  getDefaultMode,
  isStrictFormatPrompt,
};
