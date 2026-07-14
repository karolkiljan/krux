#!/usr/bin/env node
// krux — UserPromptSubmit nudge delegacji do Hordy.
//
// Delegacja do orków nie może zależeć wyłącznie od pamięci modelu (ta sama
// słabość samoobserwacji co dryf persony). Hook łapie w prompt triggery ról z
// agents/triggers.json (logika dopasowania w lib/horda-match.js) i wstrzykuje
// jedną linię wskazówki z bramką korzyści.
//
// Zasady:
//   - throttle per-sesja: max 1 nudge na KRUX_HORDA_NUDGE_INTERVAL turnów
//     (domyślnie 5), stan w <stateDir>/.krux-horda-nudge,
//   - działa niezależnie od stanu persony (orki istnieją zawsze),
//   - KRUX_HORDA_NUDGE=0 albo =off wyłącza całość.

const fs = require('fs');
const path = require('path');
const { stateDir } = require('./lib/state-dir');
const { onPromptPayload, emitContext } = require('./lib/hook-io');
const { matchedRoles } = require('./lib/horda-match');
const { readCount, writeCount } = require('./lib/drift-guard');

const NUDGE_FILE = '.krux-horda-nudge';
const DEFAULT_NUDGE_INTERVAL = 5;
const TRIGGERS_PATH = path.join(__dirname, '..', 'agents', 'triggers.json');

function nudgeInterval() {
  const n = parseInt(process.env.KRUX_HORDA_NUDGE_INTERVAL, 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_NUDGE_INTERVAL;
}

onPromptPayload(({ prompt, sessionId }) => {
  const enabled = (process.env.KRUX_HORDA_NUDGE || '').toLowerCase();
  if (enabled === '0' || enabled === 'off') process.exit(0);

  const claudeDir = stateDir();
  try {
    fs.mkdirSync(claudeDir, { recursive: true });
  } catch (e) {
    process.exit(0);
  }

  // Wpis = tury od ostatniego nudge; brak wpisu = w tej sesji jeszcze nie było.
  // Jeden zapis pliku na turę: bump ląduje na dysku tylko gdy nudge nie leci,
  // inaczej od razu zapisywane jest 0.
  const since = readCount(claudeDir, NUDGE_FILE, sessionId);
  const bumped = since === undefined ? undefined : since + 1;
  const eligible = since === undefined || bumped >= nudgeInterval();

  const roles = matchedRoles(prompt, TRIGGERS_PATH);
  if (roles.length === 0 || !eligible) {
    if (bumped !== undefined) writeCount(claudeDir, NUDGE_FILE, sessionId, bumped);
    process.exit(0);
  }

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
  emitContext(
    `HORDA: prompt pasuje do ${listed}. ` +
    'Bramka korzyści (orchestration.md): izolacja kontekstu / świeże oko / ' +
    'równoległość / zamknięta procedura → poślij orka w tunel (wołaj po imieniu); ' +
    'trywialne → Krux sam. Nie spawnuj na siłę.'
  );
  process.exit(0);
});
