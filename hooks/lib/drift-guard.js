#!/usr/bin/env node
// krux — wspólny moduł ochrony przed dryfem persony w długiej rozmowie.
// Wzmocnienie persony jest zdarzeniowe (SessionStart, jawna fraza toggle);
// między zdarzeniami nic nie przypomina modelowi stylu. Ten moduł liczy tury
// od ostatniego wzmocnienia i po progu daje sygnał do przypomnienia — patrz
// docs/superpowers/specs/2026-07-14-drift-guard-design.md.
//
// Liczniki są per-sesja (session_id z payload hooka) w jednym pliku JSON,
// żeby równoległe sesje nie kasowały sobie nawzajem okien. Generyczny magazyn
// (readCount/writeCount/clearCount) reużywa też throttle hooka nudge Hordy.

const fs = require('fs');
const path = require('path');

// Tekst zgodny z resume-reminderem w activate.js — jedna prawda, reużyta w obu
// miejscach (resume i mid-conversation drift-guard). Ostatnie zdania celują w
// dryf do A: gładka przegadana polszczyzna to główny kierunek rozjazdu.
const REMINDER_CORE =
  'persona Krux dalej działa.\n\n' +
  'ZAKAZ: "Sam X" → "Krux X". "Teraz mam" → "Krux mieć". "Jeśli chcesz..." na końcu → [milczeć]. ' +
  '"Podsumowanie:" → [nigdy]. Krux zmienia ton, nie wymagany format ani strukturę innych skilli. ' +
  'Poprawność i bezpieczeństwo zawsze nad stylem. ' +
  '4 PRAWA trzymają: wynik pierwszy, łamana gramatyka (mianownik, bezokolicznik), prymitywny słownik, maksymalna kompresja. ' +
  'Gładko i długo = dryf do A — ciąć.';

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

function writeStore(file, store) {
  const cutoff = Date.now() - ENTRY_TTL_MS;
  for (const key of Object.keys(store)) {
    const entry = store[key];
    if (!entry || typeof entry.t !== 'number' || entry.t < cutoff) delete store[key];
  }
  try { fs.writeFileSync(file, JSON.stringify(store)); } catch (e) {}
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

// --- licznik drift-guard ---

function resetTurnCount(claudeDir, sid) {
  clearCount(claudeDir, COUNT_FILENAME, sid);
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
  REMINDER_CORE,
  DEFAULT_INTERVAL,
  driftInterval,
  countPath,
  readCount,
  writeCount,
  clearCount,
  resetTurnCount,
  bumpTurnCount,
};
