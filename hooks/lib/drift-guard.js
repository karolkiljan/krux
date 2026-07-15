#!/usr/bin/env node
// krux — wspólny moduł ochrony przed dryfem persony w długiej rozmowie.
// Aktywna persona poniżej progu dostaje krótki reminder. Licznik wybiera
// okresowy pełny guard z przykładem — patrz design drift-guard.
//
// Liczniki są per-sesja (session_id z payload hooka) w jednym pliku JSON,
// żeby równoległe sesje nie kasowały sobie nawzajem okien. Generyczny magazyn
// (readCount/writeCount/clearCount) reużywa też throttle hooka nudge Hordy.

const fs = require('fs');
const path = require('path');

// Jeden pozytywny kontrakt, reużyty przy każdym wzmocnieniu persony:
// tożsamość + zachowanie treści zadania + konkretny wzorzec odpowiedzi.
// Krótki anchor pilnuje formy bez uczenia modelu anty-wzorców.
const IDENTITY_ANCHOR =
  'Krux = techniczny ork: wynik pierwszy, łamana gramatyka, prosty słownik, kompresja bez utraty faktów.';

const VOICE_CONTRACT =
  'Zwykła odpowiedź zaczynać śladem łamanej gramatyki, np. „Kod działać.” albo „Testy zielone.”';

const TASK_CONTRACT =
  'Wymagany format, struktura, kod oraz każdy warunek, przyczyna, ryzyko i wynik weryfikacji zostają dosłowne.';

function turnReminderEnabled() {
  const value = (process.env.KRUX_TURN_REMINDER || '').toLowerCase();
  return value !== '0' && value !== 'off';
}

// Pozytywne demonstracje rotują per sesja. Każda pokazuje zarazem głos Kruxa
// i techniczny konkret, zamiast utrwalać niepożądany styl przez anty-przykład.
const MICRO_EXAMPLES = [
  'Wzorzec Krux: „Wina walidacja: regex przepuszczać pusty email. Fix: odrzucić pusty string przed regexem.”',
  'Wzorzec Krux: „Zrobione. Testy zielone.”',
  'Wzorzec Krux: „Krux sprawdził logi. Przyczyna: timeout DNS po 5 s.”',
  'Wzorzec Krux: „Retry tylko timeout/429/5xx, max 3, backoff + jitter; mutacja wymaga idempotency key.”',
];

function buildTurnReminder(example) {
  return `${IDENTITY_ANCHOR} ${VOICE_CONTRACT} ${TASK_CONTRACT} ${example}`;
}

function buildFullReminder(example) {
  return `${IDENTITY_ANCHOR}\n\n4 PRAWA: wynik pierwszy; łamana gramatyka; prosty słownik; kompresja. ${VOICE_CONTRACT} ${TASK_CONTRACT}\n${example}`;
}

// Kompatybilność dla konsumentów i testów starszego API.
const TURN_REMINDER = buildTurnReminder(MICRO_EXAMPLES[0]);
const REMINDER_CORE = buildFullReminder(MICRO_EXAMPLES[0]);

const DEFAULT_INTERVAL = 10;
const COUNT_FILENAME = '.krux-turn-count';
const ENTRY_TTL_MS = 24 * 60 * 60 * 1000;

function driftInterval() {
  const n = parseInt(process.env.KRUX_DRIFT_INTERVAL, 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_INTERVAL;
}

function countPath(claudeDir) {
  return path.join(claudeDir, COUNT_FILENAME);
}

function normalizeSid(sid) {
  return (typeof sid === 'string' && sid) ? sid : 'default';
}

function readStore(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    // Goły int z v2.7.0 albo inny nie-obiekt = format obcy → pusty magazyn.
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch (e) {}
  return {};
}

// Zapis tmp+rename: czytelnik nigdy nie widzi częściowego pliku (częściowy
// JSON parsowałby się jako {} i następny zapis wymiótłby liczniki wszystkich
// sesji). Resztkowy lost-update dwóch RÓWNOCZESNYCH zapisów (read-modify-write
// bez locka) zostaje zaakceptowany: skutkiem jest najwyżej przesunięta kadencja
// reminderów jednej sesji, a lock kosztowałby więcej niż chroni.
function writeStore(file, store) {
  const cutoff = Date.now() - ENTRY_TTL_MS;
  for (const key of Object.keys(store)) {
    const entry = store[key];
    if (!entry || typeof entry.t !== 'number' || entry.t < cutoff) delete store[key];
  }
  const tmp = file + '.tmp.' + process.pid;
  try {
    fs.writeFileSync(tmp, JSON.stringify(store));
    fs.renameSync(tmp, file);
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch (e2) {}
  }
}

// --- generyczny magazyn per-sesyjnych liczników ---

function readCount(claudeDir, filename, sid) {
  const entry = readStore(path.join(claudeDir, filename))[normalizeSid(sid)];
  return entry && typeof entry.n === 'number' ? entry.n : undefined;
}

function writeCount(claudeDir, filename, sid, n) {
  const file = path.join(claudeDir, filename);
  const store = readStore(file);
  store[normalizeSid(sid)] = { n, t: Date.now() };
  writeStore(file, store);
}

function clearCount(claudeDir, filename, sid) {
  const file = path.join(claudeDir, filename);
  const store = readStore(file);
  if (!(normalizeSid(sid) in store)) return;
  delete store[normalizeSid(sid)];
  writeStore(file, store);
}

// --- stan aktywacji persony per sesja ---
//
// Wstrzyknięcie SKILL.md jest per-sesja, więc gate per-turn reminderów też musi
// być per-sesja. Globalny plik .krux-active zostaje wyłącznie dla statusline
// (bash bez session_id) — one-shot w sesji A nie może szumieć reminderami w
// równoległej sesji B, która persony nigdy nie widziała. Wpis dzieli TTL 24h
// magazynu; odświeża go każdy SessionStart (startup/resume/compact), więc gaśnie
// tylko w sesji żyjącej >24h bez żadnego z tych zdarzeń — akceptowane.
const ACTIVE_FILENAME = '.krux-active-sessions';

function markSessionActive(claudeDir, sid) {
  writeCount(claudeDir, ACTIVE_FILENAME, sid, 1);
}

function clearSessionActive(claudeDir, sid) {
  clearCount(claudeDir, ACTIVE_FILENAME, sid);
}

function isSessionActive(claudeDir, sid) {
  return readCount(claudeDir, ACTIVE_FILENAME, sid) === 1;
}

// --- licznik drift-guard ---

function resetTurnCount(claudeDir, sid) {
  clearCount(claudeDir, COUNT_FILENAME, sid);
}

// Licznik emisji żyje w osobnym pliku, CELOWO poza resetTurnCount:
// wzmocnienie persony (SessionStart, toggle) resetuje okno turnów, ale
// rotacja przykładów ma iść dalej — długa sesja dostaje kolejno różne pary.
const EMIT_FILENAME = '.krux-drift-emit';

function nextMicroExample(claudeDir, sid) {
  const n = readCount(claudeDir, EMIT_FILENAME, sid) || 0;
  writeCount(claudeDir, EMIT_FILENAME, sid, n + 1);
  return MICRO_EXAMPLES[n % MICRO_EXAMPLES.length];
}

// Inkrementuje licznik turnów tej sesji od ostatniego wzmocnienia persony.
// Zwraca true dokładnie gdy próg osiągnięty (i czyści wpis sesji) — wołający
// ma wtedy wyemitować przypomnienie. Inaczej false i cicha persystencja.
function bumpTurnCount(claudeDir, sid) {
  const n = (readCount(claudeDir, COUNT_FILENAME, sid) || 0) + 1;
  if (n >= driftInterval()) {
    resetTurnCount(claudeDir, sid);
    return true;
  }
  writeCount(claudeDir, COUNT_FILENAME, sid, n);
  return false;
}

// --- stan natywnej tury Codexa ---

const CODEX_TURN_FILENAME = '.krux-codex-turn-context';
const DEFAULT_TOOL_INTERVAL = 4;

function toolInterval(env = process.env) {
  const n = Number.parseInt(env.KRUX_CODEX_TOOL_INTERVAL, 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_TOOL_INTERVAL;
}

function updateTurnEntry(dir, sid, update) {
  const file = path.join(dir, CODEX_TURN_FILENAME);
  const store = readStore(file);
  const key = normalizeSid(sid);
  store[key] = { ...update(store[key]), t: Date.now() };
  writeStore(file, store);
  return store[key];
}

function markPromptTurn(dir, sid, turnId, { strict = false } = {}) {
  if (!turnId) return;
  updateTurnEntry(dir, sid, () => ({ turnId, strict, anchored: true, n: 0 }));
}

function isStrictTurn(dir, sid, turnId) {
  if (!turnId) return false;
  const entry = readStore(path.join(dir, CODEX_TURN_FILENAME))[normalizeSid(sid)];
  return Boolean(entry && entry.turnId === turnId && entry.strict);
}

function shouldReinforceAfterTool(dir, sid, turnId, env = process.env) {
  if (!turnId) return false;
  let shouldEmit = false;
  updateTurnEntry(dir, sid, previous => {
    const entry = previous && previous.turnId === turnId
      ? { ...previous }
      : { turnId, strict: false, anchored: false, n: 0 };
    entry.n += 1;
    shouldEmit = !entry.anchored || entry.n >= toolInterval(env);
    if (shouldEmit) {
      entry.anchored = true;
      entry.n = 0;
    }
    return entry;
  });
  return shouldEmit;
}

module.exports = {
  IDENTITY_ANCHOR,
  VOICE_CONTRACT,
  TASK_CONTRACT,
  buildTurnReminder,
  buildFullReminder,
  TURN_REMINDER,
  turnReminderEnabled,
  REMINDER_CORE,
  MICRO_EXAMPLES,
  EMIT_FILENAME,
  ACTIVE_FILENAME,
  nextMicroExample,
  DEFAULT_INTERVAL,
  driftInterval,
  countPath,
  readCount,
  writeCount,
  clearCount,
  markSessionActive,
  clearSessionActive,
  isSessionActive,
  resetTurnCount,
  bumpTurnCount,
  CODEX_TURN_FILENAME,
  DEFAULT_TOOL_INTERVAL,
  toolInterval,
  markPromptTurn,
  isStrictTurn,
  shouldReinforceAfterTool,
};
