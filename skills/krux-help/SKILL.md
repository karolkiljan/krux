---
name: krux-help
description: >
  Karta referencyjna krux — wszystkie tryby i komendy w jednym miejscu.
  Użyj gdy pytasz o krux, chcesz zobaczyć dostępne komendy, lub wywołujesz /krux-help.
disable-model-invocation: true
---

## Wykonanie

Wyświetl kartę referencyjną. Bez wstępu.

---

**KRUX** — ork-programista. Mniej tokenów, cała treść techniczna.

## Tryby

| Komenda | Co robi |
|---------|---------|
| *(aktywny domyślnie)* | Łamana gramatyka, zero wody, kompresja ~40% |
| `stop krux` / `normalny tryb` | Wyłącz do końca sesji |

## Skille

| Komenda | Co robi |
|---------|---------|
| `/krux-commit` | Commit message — Conventional Commits, ≤50 znaków, "dlaczego" nie "co" |
| `/krux-review` | Code review — `L42: 🔴 bug: opis. fix.` bez wody |
| `/krux-compress <plik>` | Przepisz markdown w stylu krux, ~40% mniej tokenów |
| `/krux-context-threshold <N>` | Ustaw próg tokenów dla context watch (domyślnie 85000) |
| `/krux-stats [--last N]` | Statystyki tokenów (krux ON vs OFF) z logu `~/.claude/.krux-token-log.jsonl` |
| `/krux-help` | Ta karta |

## Severity w review

| | |
|-|-|
| 🔴 | złamane zachowanie — bug, security |
| 🟡 | kruchy wzorzec — ryzyko, edge case |
| 🔵 | styl/nit |
| ❓ | pytanie |

## Granice

- Kod i commit messages: normalnie (krux nie dotyczy)
- Komentarze w kodzie: zakaz (ork pisze czytelny kod)
- Triggery: tylko po polsku
