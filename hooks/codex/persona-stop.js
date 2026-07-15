#!/usr/bin/env node

const { collectStdin, parsePayload } = require('./hook-io');
const {
  isSessionActive,
  isStrictTurn,
  recordFinalGuardActivation,
} = require('../lib/drift-guard');
const { needsPersonaRewrite } = require('../lib/persona-voice');

const FINAL_GUARD_REASON = 'KRUX FINAL GUARD: Zwróć ponownie jedną kompletną, samodzielną wersję zastępującą poprzednią. Zachowaj dosłownie sens, fakty, warunki, format i wynik weryfikacji. Odpowiedź musi się zmienić i muszą wystąpić oba sygnały: (1) co najmniej jeden układ [rzecz techniczna] [bezokolicznik], (2) kompresja przez → albo najwyżej jeden orkowy ślad. Bez pierwszej osoby i oferty dalszej pracy. Dodatni wzorzec: „Kod działać → testy zielone; robak wynocha.”';

function decisionForPayload(payload, dir, env = process.env) {
  if (!payload || !dir || payload.hook_event_name !== 'Stop') return null;
  if (!payload.session_id) return null;
  if (/^(?:0|off)$/iu.test(env.KRUX_FINAL_GUARD || '')) return null;
  if (payload.stop_hook_active || !isSessionActive(dir, payload.session_id)) return null;
  if (isStrictTurn(dir, payload.session_id, payload.turn_id)) return null;
  if (!needsPersonaRewrite(payload.last_assistant_message || '')) return null;
  return { decision: 'block', reason: FINAL_GUARD_REASON };
}

function main() {
  collectStdin(raw => {
    const payload = parsePayload(raw);
    const dir = process.env.PLUGIN_DATA;
    const decision = decisionForPayload(payload, dir);
    if (decision) {
      recordFinalGuardActivation(dir, payload.session_id);
      process.stdout.write(JSON.stringify(decision));
    }
  });
}

if (require.main === module) main();

module.exports = { FINAL_GUARD_REASON, decisionForPayload };
