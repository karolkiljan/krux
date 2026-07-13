# Adapter orkiestracji — Claude Code

Używaj tylko gdy host udostępnia `Agent` tool i agentów pluginu Claude Code.

## Wywołanie

- Spawnuj nazwany typ `@krux:ork-nazwa` przez `Agent`.
- User może wywołać tę samą nazwę wprost.
- Dla pracy równoległej wyślij wiele niezależnych wywołań `Agent` w jednej
  wiadomości; dla łańcucha czekaj na wynik poprzednika.
- Każdy prompt zawiera `persona=on|off` oraz kontrakt z
  `${CLAUDE_PLUGIN_ROOT}/agents/_common.md`.

## Modele

- `sonnet`: typowa implementacja jednoplikowa, testy, prosty frontend/backend.
- `opus`: złożony review, wielowarstwowy bug, projekt i trade-offy.
- `haiku`: wyłącznie lekki lookup lub pojedynczy odczyt.

Pominięcie modelu dziedziczy ustawienie rodzica. Nie używaj droższego modelu
do zadania, które jest tylko grepem.

## Przykłady mapowania

- `napraw bug` → `@krux:ork-tropiciel`
- `napisz testy` → `@krux:ork-tester`
- `review` → `@krux:ork-sedzia`
- `backend/API` → `@krux:ork-kowal`
- `frontend/UI` → `@krux:ork-malarz`
- `martwy kod/refactor` → `@krux:ork-burzyciel`
