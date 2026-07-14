#!/usr/bin/env node
// krux — UserPromptSubmit nudge delegacji do Hordy.
//
// Delegacja do orków nie może zależeć wyłącznie od pamięci modelu (ta sama
// słabość samoobserwacji co dryf persony). Hook łapie w prompt triggery ról z
// agents/triggers.json i wstrzykuje jedną linię wskazówki z bramką korzyści.
//
// Zasady:
//   - matching best-effort: word-boundary + fold diakrytyków + lowercase;
//     polska fleksja celowo nieobsługiwana ("błędu" nie łapie "błąd"),
//   - throttle per-sesja: max 1 nudge na KRUX_HORDA_NUDGE_INTERVAL turnów
//     (domyślnie 5), stan w <stateDir>/.krux-horda-nudge,
//   - działa niezależnie od stanu persony (orki istnieją zawsze),
//   - KRUX_HORDA_NUDGE=0 albo =off wyłącza całość.

const fs = require('fs');
const path = require('path');
const { stateDir } = require('./lib/state-dir');
const { readCount, writeCount } = require('./lib/drift-guard');

const NUDGE_FILE = '.krux-horda-nudge';
const DEFAULT_NUDGE_INTERVAL = 5;

function nudgeInterval() {
  const n = parseInt(process.env.KRUX_HORDA_NUDGE_INTERVAL, 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_NUDGE_INTERVAL;
}

function fold(text) {
  return text
    .toLowerCase()
    .replace(/ą/g, 'a').replace(/ć/g, 'c').replace(/ę/g, 'e')
    .replace(/ł/g, 'l').replace(/ń/g, 'n').replace(/ó/g, 'o')
    .replace(/ś/g, 's').replace(/ż/g, 'z').replace(/ź/g, 'z');
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchedRoles(prompt) {
  let triggers;
  try {
    triggers = JSON.parse(
      fs.readFileSync(path.join(__dirname, '..', 'agents', 'triggers.json'), 'utf8')
    );
  } catch (e) {
    return [];
  }
  const foldedPrompt = fold(prompt);
  const roles = [];
  for (const [role, words] of Object.entries(triggers)) {
    for (const word of words) {
      const re = new RegExp(
        `(?<![\\p{L}\\p{N}])${escapeRegex(fold(word))}(?![\\p{L}\\p{N}])`, 'u'
      );
      if (re.test(foldedPrompt)) {
        roles.push({ role, word });
        break;
      }
    }
  }
  return roles;
}

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { raw += chunk; });
process.stdin.on('end', () => {
  const enabled = (process.env.KRUX_HORDA_NUDGE || '').toLowerCase();
  if (enabled === '0' || enabled === 'off') process.exit(0);

  let prompt = '';
  let sessionId;
  try {
    const payload = JSON.parse(raw);
    prompt = (payload.prompt || '').trim();
    sessionId = payload.session_id;
  } catch (e) {
    process.exit(0);
  }
  if (!prompt) process.exit(0);

  const claudeDir = stateDir();
  try {
    fs.mkdirSync(claudeDir, { recursive: true });
  } catch (e) {
    process.exit(0);
  }

  // Wpis = tury od ostatniego nudge; brak wpisu = w tej sesji jeszcze nie było.
  const since = readCount(claudeDir, NUDGE_FILE, sessionId);
  const bumped = since === undefined ? undefined : since + 1;
  if (bumped !== undefined) writeCount(claudeDir, NUDGE_FILE, sessionId, bumped);

  const roles = matchedRoles(prompt);
  const eligible = since === undefined || bumped >= nudgeInterval();
  if (roles.length === 0 || !eligible) process.exit(0);

  // Imiona z lore.md — nudge podpowiada wołanie po imieniu, spójnie z persona.
  const ORK_NAMES = {
    'ork-tropiciel': 'Niuch',
    'ork-kowal': 'Grom',
    'ork-sedzia': 'Piryt',
    'ork-malarz': 'Ochra',
    'ork-tester': 'Młot',
    'ork-burzyciel': 'Lont',
  };
  const listed = roles.slice(0, 2)
    .map(({ role, word }) => {
      const name = ORK_NAMES[role];
      return `${role}${name ? ` — ${name}` : ''} („${word}")`;
    })
    .join(', ');
  writeCount(claudeDir, NUDGE_FILE, sessionId, 0);
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext:
        `HORDA: prompt pasuje do ${listed}. ` +
        'Bramka korzyści (orchestration.md): izolacja kontekstu / świeże oko / ' +
        'równoległość / zamknięta procedura → poślij orka w tunel (wołaj po imieniu); ' +
        'trywialne → Krux sam. Nie spawnuj na siłę.',
    },
  }));
  process.exit(0);
});
