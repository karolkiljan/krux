---
name: krux-flow
description: >
  Tryb iteracyjny — jeden krok na raz, bez upfront planu. Agent proponuje
  pierwszy mały ruch, wykonuje po zgodzie, raport, propozycja następnego ruchu
  na podstawie rezultatu. Użyj gdy user włączył flow (`flow`, `/krux:krux-flow`,
  `$krux:krux-flow`),
  albo gdy mówi "krok po kroku bez planu", "iteracyjnie", "step by step od zera".
argument-hint: on | off | cel do zrealizowania
---

Args: $ARGUMENTS — `on` włączyć flow, `off` wyłączyć, inaczej traktować jako cel (włączyć flow i zacząć od pierwszego ruchu).

## Zadanie

Budowanie rozwiązania iteracyjnie — jak programista pisze kod ręcznie. Zero upfront planu.
Pętla: propozycja → zgoda → egzekucja → raport → propozycja następnego.

## Flow

**Aktywacja:** user pisze `flow` / `flow on`, `/krux:krux-flow on` albo `$krux:krux-flow on`. Hook zapalić flagę `<stateDir>/.krux-flow-active` (`~/.claude` pod Claude Code, `PLUGIN_DATA` pod Codex). Od teraz każdy prompt user dostać przypomnienie w kontekście.

**Dezaktywacja:** `flow off` / `stop flow` / `/krux:krux-flow off` / `$krux:krux-flow off`.

## Proces (podczas aktywnego flow)

1. User podaje cel („chcę X")
2. Agent: *„X. Zacząć od Y — najmniejszy sensowny ruch. Powód: [1 linia]. Robić Y?"*
3. User: `tak` / `rób` / `leć`
4. Agent robi **tylko Y**. Raport: `plik:linia — zmiana. test: zielony.`
5. Agent: *„Y działa. Następny ruch: Z — bo [konkretny powód z Y]. Robić?"*
6. Iteracja do celu osiągniętego

## Prawa

- Zakaz upfront planu. Nie „kroki 1-7", nie „plan implementacji". Tylko **następny** ruch.
- Każdy następny krok wybierany **po** rezultacie poprzedniego — nie z góry.
- Jedna propozycja = jedna zmiana obserwowalna. Nie kumulować.
- Propozycja ma **powód** (1 linia), nie samo „robić X".
- Czekaj na zgodę przed egzekucją. `tak` / `rób` / `leć` = zgoda. Inne = pytanie lub stop.
- Raport po egzekucji: `plik:linia — co się zmieniło. test/build status.`
- Blocker → 2-3 opcje + prośba o decyzję, nie kontynuacja.
- Koniec celu → `Cel osiągnięty. X ruchów.` Gdy persona Krux aktywna, można dodać orkowe domknięcie.

## vs Plan Mode

| Plan Mode | krux-flow |
|-----------|-----------|
| Research → pełny plan → zatwierdzenie → egzekucja A→Z | Cel → jeden ruch → rezultat → następny ruch |
| Plan wymyślony z góry | Ruch wybierany w trakcie |
| Pauza tylko na ExitPlanMode | Pauza po każdym ruchu |
| Dobre gdy zakres jasny | Dobre gdy zakres odkrywany po drodze |

## Blocker

Format:
```
Ruch 4 — blocker. `npm test` padać: `Cannot read properties of undefined`.
Opcje:
a) Null-check w `service.js:L88` — fix teraz.
b) Zmienić podejście — `Y` w ogóle zły wybór, cofnąć.
c) Zbadać głębiej — inny plik źródłem.
Co robić?
```

## Styl

Flow definiuje strukturę, nie głos. Gdy persona Krux aktywna → ton Krux. Gdy persona wyłączona → neutralna, zwięzła polszczyzna. Flow nie włącza persony i nie zmienia `.krux-mode` ani `.krux-active`.
