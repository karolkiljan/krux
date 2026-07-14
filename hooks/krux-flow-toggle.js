#!/usr/bin/env node
// krux — UserPromptSubmit hook for flow mode (iterative step-by-step).
//
// Behavior:
//   1. Recognize toggle phrases ("flow", "flow off", etc.) and flip <stateDir>/.krux-flow-active.
//   2. When flag is active, inject per-turn reminder so the model keeps behaving
//      iteratively (propose one step → wait → execute → report → propose next).
//
// Does NOT touch .krux-mode (krux persona) — flow is orthogonal. Flow can run
// without krux persona; hook stays passive when flag is absent.

const fs = require('fs');
const path = require('path');
const { stateDir } = require('./lib/state-dir');
const { onPromptPayload, emitContext } = require('./lib/hook-io');

onPromptPayload(({ prompt }) => {
  const claudeDir = stateDir();
  try {
    fs.mkdirSync(claudeDir, { recursive: true });
  } catch (e) {
    console.error('[KRUX-FLOW] state directory creation failed:', e.message);
    process.exit(0);
  }
  const flagFile = path.join(claudeDir, '.krux-flow-active');

  const onRe = /^(flow|flow on|krux-flow|krux-flow on|(\/|\$)krux:krux-flow(?: on| (?!off$).+)?|iterate|tryb krokowy)$/iu;
  const offRe = /^(flow off|stop flow|koniec flow|krux-flow off|(\/|\$)krux:krux-flow off|stop iterate|koniec iterate)$/iu;

  if (offRe.test(prompt)) {
    try {
      fs.unlinkSync(flagFile);
    } catch (e) {
      if (e.code !== 'ENOENT') {
        console.error('[KRUX-FLOW] flag removal failed:', e.message);
        process.exit(0);
      }
    }
    emitContext('KRUX-FLOW OFF: tryb iteracyjny wyłączony. Potwierdź wyłączenie w stylu orkowym (jeśli krux aktywny), dalej pracuj normalnie.');
    process.exit(0);
  }

  if (onRe.test(prompt)) {
    try {
      fs.closeSync(fs.openSync(flagFile, 'w'));
    } catch (e) {
      console.error('[KRUX-FLOW] flag creation failed:', e.message);
      process.exit(0);
    }
    emitContext(
      'KRUX-FLOW ON: tryb iteracyjny aktywny. ZASADY: ' +
      '(1) Zero upfront planów — nie rozpisuj kroków 1-N. ' +
      '(2) Zapytaj użytkownika o cel jeśli jeszcze nie znany. ' +
      '(3) Zaproponuj JEDEN najmniejszy sensowny ruch + powód (1 linia) + zapytaj "Robić?". ' +
      '(4) Czekaj na "tak"/"rób"/"leć" — wtedy wykonaj TYLKO ten jeden ruch. ' +
      '(5) Raport: plik:linia — zmiana + status testu/build. ' +
      '(6) Zaproponuj następny ruch na podstawie REZULTATU, nie z góry wymyślonej listy. ' +
      '(7) Iteruj aż cel osiągnięty → "Cel osiągnięty. X ruchów.". ' +
      '(8) Dezaktywacja: "flow off" / "stop flow". ' +
      'Pełne zasady w skilla krux-flow. ' +
      'Potwierdź włączenie krótko i zrozumiale dla pierwszego razu (jeden ruch na raz, zgoda przed egzekucją); persona krux aktywna → ton orkowy, inaczej neutralnie.'
    );
    process.exit(0);
  }

  // Flag active → inject short reminder every turn so the model stays in mode.
  if (fs.existsSync(flagFile)) {
    emitContext(
      'KRUX-FLOW aktywny: pracujesz iteracyjnie. Jeden mały ruch na raz. ' +
      'Propozycja (z powodem) → zgoda usera → egzekucja → raport plik:linia → ' +
      'propozycja następnego na podstawie rezultatu. Zero upfront planów. ' +
      'Wyłączenie: "flow off" / "stop flow".'
    );
  }
  process.exit(0);
});
