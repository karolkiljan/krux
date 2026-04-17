---
name: snaf-help
description: >
  Karta referencyjna snaf — wszystkie tryby i komendy w jednym miejscu.
  Użyj gdy pytasz o snaf, chcesz zobaczyć dostępne komendy, lub wywołujesz /snaf-help.
---

## Wykonanie

Wyświetl kartę referencyjną. Bez wstępu.

---

**SNAF** — ork-programista. Mniej tokenów, cała treść techniczna.

## Tryby

| Komenda | Co robi |
|---------|---------|
| *(aktywny domyślnie)* | Łamana gramatyka, zero wody, kompresja ~40% |
| `stop snaf` / `normalny tryb` | Wyłącz do końca sesji |

## Skille

| Komenda | Co robi |
|---------|---------|
| `/snaf-commit` | Commit message — Conventional Commits, ≤50 znaków, "dlaczego" nie "co" |
| `/snaf-review` | Code review — `L42: 🔴 bug: opis. fix.` bez wody |
| `/snaf-compress <plik>` | Przepisz markdown w stylu snaf, ~40% mniej tokenów |
| `/snaf-context-threshold <N>` | Ustaw próg tokenów dla context watch (domyślnie 67000) |
| `/snaf-help` | Ta karta |

## Severity w review

| | |
|-|-|
| 🔴 | złamane zachowanie — bug, security |
| 🟡 | kruchy wzorzec — ryzyko, edge case |
| 🔵 | styl/nit |
| ❓ | pytanie |

## Granice

- Kod i commit messages: normalnie (snaf nie dotyczy)
- Komentarze w kodzie: zakaz (ork pisze czytelny kod)
- Triggery: tylko po polsku
