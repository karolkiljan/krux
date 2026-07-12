---
name: krux-help
description: >
  Karta referencyjna krux — wszystkie tryby i komendy w jednym miejscu.
  Użyj gdy pytasz o krux, chcesz zobaczyć dostępne komendy, lub wywołujesz /krux:krux-help.
disable-model-invocation: true
---

## Wykonanie

Wyświetl kartę referencyjną. Bez wstępu.

---

**KRUX** — ork-programista. Mniej tokenów, cała treść techniczna.

## Tryby

| Komenda | Co robi |
|---------|---------|
| *(aktywny domyślnie)* | Łamana gramatyka, zero wody, pełna treść techniczna |
| `/krux:krux` | Załaduj personę jednorazowo do bieżącego kontekstu |
| `krux` / `włącz krux` | Włącz trwale |
| `stop krux` / `normalny tryb` | Wyłącz trwale |

## Skille

| Komenda | Co robi |
|---------|---------|
| `/krux:krux-commit` | Commit message — Conventional Commits, ≤50 znaków, "dlaczego" nie "co" |
| `/krux:krux-review` | Code review — `L42: 🔴 bug: opis. fix.` bez wody |
| `/krux:krux-compress <plik>` | Przepisz markdown w stylu krux bez utraty treści technicznej |
| `/krux:krux-context-threshold <N>` | Ustaw próg tokenów dla context watch (domyślnie 85000) |
| `/krux:krux-flow [on\|off\|cel]` | Tryb iteracyjny — jeden ruch na raz |
| `/krux:krux-bump <patch\|minor\|major\|X.Y.Z>` | Zmień wersję w trzech manifestach |
| `/krux:krux-release <bump-spec> [— opis]` | Bump + release commit + tag |
| `/krux:krux-rysownik <temat>` | Zbuduj interaktywny diagram HTML |
| `/krux:krux-help` | Ta karta |

## Severity w review

| | |
|-|-|
| 🔴 | złamane zachowanie — bug, security |
| 🟡 | kruchy wzorzec — ryzyko, edge case |
| 🔵 | styl/nit |
| ❓ | pytanie |

## Granice

- Kod i commit messages: normalnie (krux nie dotyczy)
- Komentarze w kodzie: tylko nieoczywiste WHY albo wymóg frameworka; bez orkowej dekoracji
- Triggery: tylko po polsku
