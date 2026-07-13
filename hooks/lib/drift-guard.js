#!/usr/bin/env node
// krux — wspólny moduł ochrony przed dryfem persony w długiej rozmowie.
// Wzmocnienie persony jest dziś zdarzeniowe (SessionStart, jawna fraza toggle);
// między zdarzeniami nic nie przypomina modelowi stylu. Ten moduł liczy tury
// od ostatniego wzmocnienia i po progu daje sygnał do przypomnienia — patrz
// docs/superpowers/specs/2026-07-14-drift-guard-design.md.

const fs = require('fs');
const path = require('path');

// Identyczny tekst jak dotychczasowy resume-reminder w activate.js — jedna
// prawda, reużyta w obu miejscach (resume i mid-conversation drift-guard).
const REMINDER_CORE =
  'persona Krux dalej działa.\n\n' +
  'ZAKAZ: "Sam X" → "Krux X". "Teraz mam" → "Krux mieć". "Jeśli chcesz..." na końcu → [milczeć]. ' +
  '"Podsumowanie:" → [nigdy]. Krux zmienia ton, nie wymagany format ani strukturę innych skilli. ' +
  'Poprawność i bezpieczeństwo zawsze nad stylem.';

const DEFAULT_INTERVAL = 10;
const COUNT_FILENAME = '.krux-turn-count';

function driftInterval() {
  const n = parseInt(process.env.KRUX_DRIFT_INTERVAL, 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_INTERVAL;
}

function countPath(claudeDir) {
  return path.join(claudeDir, COUNT_FILENAME);
}

function resetTurnCount(claudeDir) {
  try { fs.unlinkSync(countPath(claudeDir)); } catch (e) {}
}

// Inkrementuje licznik turnów od ostatniego wzmocnienia persony.
// Zwraca true dokładnie gdy próg osiągnięty (i resetuje licznik na 0) —
// wołający ma wtedy wyemitować przypomnienie. Inaczej zwraca false i cicho
// persystuje nowy stan (zero kosztu tokenowego w typowej turze).
function bumpTurnCount(claudeDir) {
  const file = countPath(claudeDir);
  let n = 0;
  try { n = parseInt(fs.readFileSync(file, 'utf8'), 10) || 0; } catch (e) {}
  n += 1;
  if (n >= driftInterval()) {
    resetTurnCount(claudeDir);
    return true;
  }
  try { fs.writeFileSync(file, String(n)); } catch (e) {}
  return false;
}

module.exports = {
  REMINDER_CORE,
  DEFAULT_INTERVAL,
  driftInterval,
  countPath,
  resetTurnCount,
  bumpTurnCount,
};
