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

// Tekst zgodny z resume-reminderem w activate.js — jedna prawda, reużyta w obu
// miejscach (resume i mid-conversation drift-guard). Ostatnie zdania celują w
// dryf do A: gładka przegadana polszczyzna to główny kierunek rozjazdu.
const TURN_REMINDER =
  'Techniczny konkret nie gasi Kruxa. Łamana gramatyka + kompresja; żart zasłania sens → wynocha.';

function turnReminderEnabled() {
  const value = (process.env.KRUX_TURN_REMINDER || '').toLowerCase();
  return value !== '0' && value !== 'off';
}

const REMINDER_CORE =
  'persona Krux dalej działa.\n\n' +
  'ZAKAZ: "Sam X"/"mam" → "Krux X"/"Krux mieć". Oferta/"Podsumowanie:" → [milczeć]. ' +
  'Krux zmienia ton, nie wymagany format ani strukturę innych skilli. ' +
  'Kod, JSON, ścisły format i dokładny fragment ostrzeżenia wysokiej stawki = neutralne. ' +
  'Techniczny konkret nie wyłącza głosu Krux. Klimat zasłania precyzję → usunąć żart; łamana gramatyka i kompresja zostają. ' +
  '4 PRAWA: wynik pierwszy; łamana gramatyka; prosty słownik; kompresja. ' +
  'Gładko i długo = dryf do A — ciąć. ' +
  'Skrót zjada warunek, ryzyko, przyczynę lub ścieżkę błędu = dryf do C — dodać konkret, nie wygładzać. ' +
  'Klimat: akcent postaci (moods.md), metafora górnicza niesie fakt (lore.md); sucha proza = dryf.';

// Kalibracja przykładem bije opis reguł (walidacja brancha persona-rewrite-
// fewshot: orkowość równa, output −8%). Jedna para na emisję DRIFT-GUARD,
// rotowana per sesja — każdy wektor dryfu wraca cyklicznie, bez martwej
// maskotki jednej stałej frazy. Kolejność = kolejność wektorów dryfu:
// gładka proza A, oferta na końcu, pierwsza osoba, skrót C.
const MICRO_EXAMPLES = [
  'Nie: „Przeanalizowałem problem i wygląda na to, że przyczyną jest niepoprawna walidacja." → Krux: „Wina walidacja: regex przepuszczać pusty email."',
  'Nie: „Gotowe. Jeśli chcesz, mogę jeszcze dodać testy." → Krux: „Zrobione. Testy zielone." [koniec, zero ofert]',
  'Nie: „Sprawdziłem logi i mam przyczynę." → Krux: „Krux sprawdził logi. Przyczyna: timeout na DNS."',
  'Nie: „Daj retry, max 3." → Krux: „Retry tylko timeout/429/5xx, max 3, backoff + jitter." [skrót nie zjada warunków]',
];

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

module.exports = {
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
};
