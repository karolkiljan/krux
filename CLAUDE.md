# Kontrakt utrzymania Kruxa

## Drzewo plików

```text
.claude-plugin/{plugin.json,marketplace.json}  metadane Claude Code
.codex-plugin/plugin.json                     metadane Codex
hooks/hooks.json                              wspólny rejestr hooków
hooks/krux.js                                 wspólny adapter
skills/krux/SKILL.md                          źródło głosu
skills/krux-horda/SKILL.md                    Horda na żądanie
skills/krux-konkret/SKILL.md                  tryb precyzji zakresu
skills/krux-flow/SKILL.md                     tryb iteracyjny krok-po-kroku
test/{hook,horda,contract}.test.js             testy deterministyczne
scripts/context-smoke.js                      pomiar 12 tur
package.json                                  komendy i wersja bazowa
README.md, CLAUDE.md, LICENSE                 dokumentacja i licencja
```

## Macierz zdarzeń

| Wejście | Warunek | Emisja |
|---|---|---|
| `SessionStart(startup\|clear\|compact)` | którakolwiek z trzech flag `on`; compact ma `source=compact` | body aktywnych trybów (persona, konkret, flow), w tej kolejności |
| `SessionStart(startup\|clear\|compact)` | wszystkie trzy flagi `off` | brak |
| `UserPromptSubmit` | dokładne `wyłącz krux` po `trim`, bez różnicy wielkości liter | neutralna instrukcja bieżącej tury |
| `UserPromptSubmit` | dokładne `włącz krux` po `trim`, bez różnicy wielkości liter | body skilla persony |
| `UserPromptSubmit` | dokładne `wyłącz konkret` po `trim`, bez różnicy wielkości liter | potwierdzenie wyłączenia zakresu |
| `UserPromptSubmit` | dokładne `włącz konkret` po `trim`, bez różnicy wielkości liter | kontrakt precyzji zakresu |
| `UserPromptSubmit` | dokładne `wyłącz flow` po `trim`, bez różnicy wielkości liter | potwierdzenie wyłączenia rytmu |
| `UserPromptSubmit` | dokładne `włącz flow` po `trim`, bez różnicy wielkości liter | kontrakt pętli iteracyjnej |
| każde inne wejście | dowolne | brak |

Tylko `SessionStart(startup|clear|compact)` oraz sześć dokładnych komend toggle mogą emitować kontekst.

## Reguła stanu

Trzy niezależne flagi w `<plugin-data>/`: `.krux-mode` (persona, treść `on`/`off`, brak pliku = `on`), `.krux-konkret` i `.krux-flow` (zakres i rytm, sama obecność pliku = `on`, brak = `off`). Błąd odczytu bezpiecznie wyłącza emisję. Błąd zapisu nie blokuje bieżącej instrukcji, lecz nie udaje trwałości.

## Niezmienniki

- `hooks/hooks.json` jest odkrywany przez oba hosty: Claude Code i Codex.
- `hooks/krux.js` przyjmuje obie rodziny zmiennych: `CLAUDE_PLUGIN_ROOT` / `CLAUDE_PLUGIN_DATA` oraz `PLUGIN_ROOT` / `PLUGIN_DATA`.
- Body `skills/krux/SKILL.md` po frontmatter jest jedynym źródłem głosu i ma najwyżej 65 słów.
- Horda pozostaje w `skills/krux-horda/SKILL.md` i ładuje się wyłącznie na żądanie.
- `krux-konkret` i `krux-flow` to niezależne, składalne osie — nie zmieniają głosu ani nie zależą od siebie nawzajem.
- Runtime nie ma zależności npm, a testy używają wbudowanego `node:test`.
- Wersje rekordów dystrybucji zgadzają się z `3.0.1` po usunięciu opcjonalnych metadanych build Codexa.
- Łączny rozmiar `hooks/` i `skills/` nie przekracza 8 500 bajtów.

## Komendy wydania

```bash
npm test
uv run --with pyyaml python /Users/karolkiljan/.codex/skills/.system/skill-creator/scripts/quick_validate.py skills/krux
uv run --with pyyaml python /Users/karolkiljan/.codex/skills/.system/skill-creator/scripts/quick_validate.py skills/krux-horda
uv run --with pyyaml python /Users/karolkiljan/.codex/skills/.system/skill-creator/scripts/quick_validate.py skills/krux-konkret
uv run --with pyyaml python /Users/karolkiljan/.codex/skills/.system/skill-creator/scripts/quick_validate.py skills/krux-flow
uv run --with pyyaml python /Users/karolkiljan/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py .
claude plugin validate .
python3 /Users/karolkiljan/.codex/skills/.system/plugin-creator/scripts/update_plugin_cachebuster.py .
npm run smoke:context -- --model gpt-5.6-sol
git diff --check
```
