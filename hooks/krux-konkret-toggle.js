#!/usr/bin/env node
// krux — UserPromptSubmit hook for konkret mode (surgical scope precision).
//
// Behavior:
//   1. Recognize toggle phrases ("konkret", "strict", "konkret off", etc.)
//      and flip <stateDir>/.krux-konkret-active.
//   2. When flag is active, inject per-turn reminder so the model keeps the
//      scope contract: only what was asked, simplest working solution,
//      adjacent findings reported in one line, contract passed to orks.
//
// Does NOT touch .krux-mode (persona) or .krux-flow-active (flow) — konkret
// is a third orthogonal mode. Hook stays passive when flag is absent.

const fs = require('fs');
const path = require('path');
const { stateDir } = require('./lib/state-dir');

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { raw += chunk; });
process.stdin.on('end', () => {
  let prompt = '';
  try {
    prompt = (JSON.parse(raw).prompt || '').trim();
  } catch (e) {
    process.exit(0);
  }

  const claudeDir = stateDir();
  try {
    fs.mkdirSync(claudeDir, { recursive: true });
  } catch (e) {
    console.error('[KRUX-KONKRET] state directory creation failed:', e.message);
    process.exit(0);
  }
  const flagFile = path.join(claudeDir, '.krux-konkret-active');

  const onRe = /^(konkret|konkret on|strict|strict on|krux-konkret|krux-konkret on|(\/|\$)krux:krux-konkret(?: on| (?!off$).+)?)$/iu;
  const offRe = /^(konkret off|stop konkret|koniec konkret|strict off|krux-konkret off|(\/|\$)krux:krux-konkret off)$/iu;

  const emit = (msg) => {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext: msg
      }
    }));
  };

  if (offRe.test(prompt)) {
    try {
      fs.unlinkSync(flagFile);
    } catch (e) {
      if (e.code !== 'ENOENT') {
        console.error('[KRUX-KONKRET] flag removal failed:', e.message);
        process.exit(0);
      }
    }
    emit('KRUX-KONKRET OFF: tryb chirurgicznej precyzji wyłączony. Potwierdź wyłączenie zwięźle (persona krux aktywna → ton orkowy, inaczej neutralnie), dalej pracuj normalnie.');
    process.exit(0);
  }

  if (onRe.test(prompt)) {
    try {
      fs.closeSync(fs.openSync(flagFile, 'w'));
    } catch (e) {
      console.error('[KRUX-KONKRET] flag creation failed:', e.message);
      process.exit(0);
    }
    emit(
      'KRUX-KONKRET ON: tryb chirurgicznej precyzji aktywny. ZASADY: ' +
      '(1) Rób DOKŁADNIE to o co user prosił — nic ponad. ' +
      '(2) Najprostsze działające rozwiązanie — zero abstrakcji, opcji, warstw i konfigów na zapas. ' +
      '(3) Research selektywny — czytaj tylko pliki potrzebne do zadania. ' +
      '(4) Rzeczy obok (robak w sąsiedniej funkcji, brzydki kod, okazja refaktoru) → NIE ruszaj; max 1 linia raportu "obok: X, nie ruszone". ' +
      '(5) Delegujesz subagenta/orka → przekaż ten kontrakt w jego prompt. ' +
      '(6) Dwuznaczne zadanie → jedno konkretne pytanie zamiast szerokiej interpretacji. ' +
      '(7) Poprawność bije zakres: zmiana wymagająca poprawki calling site = poprawka w zakresie, do raportu. ' +
      'Dezaktywacja: "konkret off" / "stop konkret". Pełne zasady w skillu krux-konkret. ' +
      'Potwierdź włączenie krótko i zrozumiale dla pierwszego razu (tylko proszone, najprostsze działające, rzeczy obok tylko raportowane); persona krux aktywna → ton orkowy (obraz: kuć tylko żyłę, nie ścianę), inaczej neutralnie.'
    );
    process.exit(0);
  }

  // Flag active → inject short reminder every turn so the model stays in mode.
  if (fs.existsSync(flagFile)) {
    emit(
      'KRUX-KONKRET aktywny: rób tylko to o co user prosił, nic ponad. ' +
      'Najprostsze działające. Czytaj tylko potrzebne pliki. ' +
      'Rzeczy obok → 1 linia "obok: X, nie ruszone", nie ruszaj. ' +
      'Delegacja subagenta → przekaż kontrakt konkret w jego prompt. ' +
      'Wyłączenie: "konkret off" / "stop konkret".'
    );
  }
  process.exit(0);
});
