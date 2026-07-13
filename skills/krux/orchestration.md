# Orkowie — wspólna orkiestracja

Ork = rola robocza. Definicje ról są wspólne dla hostów i żyją w
`../../agents/ork-*.md`; kontrakt odpowiedzi żyje w `../../agents/_common.md`.

**Jedyne źródło prawdy o triggerach:** `../../agents/triggers.json`.
Czytaj triggery przed delegacją. Pasujące słowo pomaga wybrać rolę, ale nie
zmusza do spawnu przy pytaniu ogólnym ani trywialnej pracy.

## Wybór adaptera hosta

- Dostępne natywne narzędzia subagentów Codexa → przeczytaj
  `orchestration-codex.md` i stosuj wyłącznie ten adapter.
- Dostępny Claude Code `Agent` tool → przeczytaj `orchestration-claude.md` i
  stosuj wyłącznie ten adapter.
- Brak obu powierzchni → pracuj sam. Nie wymyślaj wywołania narzędzia.

## Reguły wspólne

- Deleguj tylko zadanie wystarczająco duże, specjalistyczne albo niezależne,
  żeby koszt zimnego subagenta miał sens.
- Każdy prompt spawnu zawiera jawne `persona=on` albo `persona=off`; subagent
  nie dziedziczy bezpiecznie stanu głosu. Brak pewności → `persona=off`.
- Prompt przekazuje cel, zakres, ograniczenia, oczekiwany JSON i istotny stan
  poprzednich kroków. Nie wysyłaj samej nazwy roli.
- Gdy ork niepotrzebny — rób sam.

## SOLO, ŁAŃCUCH, RÓWNOLEGLE

**SOLO:** jeden wąski problem i jedna dominująca rola → jeden ork.

**ŁAŃCUCH:** rezultat A jest wejściem B. Następny ork dostaje `persona=on|off`,
diagnozę, pliki, wykonane zmiany i wynik testów poprzednika. Nie układaj
łańcucha, gdy etapy są niezależne.

**RÓWNOLEGLE:** co najmniej dwa niezależne zadania w różnych plikach lub
domenach. Nie dawaj dwóm orkom zapisu do tego samego pliku. Po powrocie sprawdź
konflikty i uruchom pełną adekwatną weryfikację.

## Raport

- Oczekiwany schemat: `{ status, summary, details, files?, tests?, verdict? }`.
- `summary` daje pierwsze zdanie dla użytkownika, nie cały raport.
- Po nietrywialnej zmianie użyj `details`, `files` i `tests`, żeby zachować:
  Jak działa, Dlaczego tak, Czytaj od i Weryfikacja.
- Nie wklejaj użytkownikowi surowego JSON. Błąd parsowania → potraktuj output
  jako tekst, nazwij niezgodność kontraktu i nie udawaj pól, których nie ma.
