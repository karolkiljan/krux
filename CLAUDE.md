# Kontrakt utrzymania Kruxa

## Drzewo plików

```text
.claude-plugin/{plugin.json,marketplace.json}  metadane Claude Code
.codex-plugin/plugin.json                     metadane Codex
hooks/hooks.json                              wspólny rejestr hooków
hooks/krux.js                                 wspólny adapter
skills/krux/SKILL.md                          źródło głosu
skills/krux-horda/SKILL.md                    Horda na żądanie
test/{hook,horda,contract}.test.js             testy deterministyczne
scripts/context-smoke.js                      pomiar 12 tur
package.json                                  komendy i wersja bazowa
README.md, CLAUDE.md, LICENSE                 dokumentacja i licencja
```

## Macierz zdarzeń

| Wejście | Warunek | Emisja |
|---|---|---|
| `SessionStart(startup\|clear\|compact)` | tryb `on`; compact ma `source=compact` | body `skills/krux/SKILL.md` |
| `SessionStart(startup\|clear\|compact)` | tryb `off` | brak |
| `UserPromptSubmit` | dokładne `wyłącz krux` po `trim`, bez różnicy wielkości liter | neutralna instrukcja bieżącej tury |
| `UserPromptSubmit` | dokładne `włącz krux` po `trim`, bez różnicy wielkości liter | body skilla |
| każde inne wejście | dowolne | brak |

Tylko `SessionStart(startup|clear|compact)` oraz dokładne komendy on/off mogą emitować kontekst.

## Reguła stanu

Jedyny stan runtime to `<plugin-data>/.krux-mode`. Brak pliku oznacza `on`; poprawne wartości to wyłącznie `on` i `off`. Błąd odczytu bezpiecznie wyłącza emisję. Błąd zapisu nie blokuje bieżącej instrukcji, lecz nie udaje trwałości.

## Niezmienniki

- `hooks/hooks.json` jest odkrywany przez oba hosty: Claude Code i Codex.
- `hooks/krux.js` przyjmuje obie rodziny zmiennych: `CLAUDE_PLUGIN_ROOT` / `CLAUDE_PLUGIN_DATA` oraz `PLUGIN_ROOT` / `PLUGIN_DATA`.
- Body `skills/krux/SKILL.md` po frontmatter jest jedynym źródłem głosu i ma najwyżej 65 słów.
- Horda pozostaje w `skills/krux-horda/SKILL.md` i ładuje się wyłącznie na żądanie.
- Runtime nie ma zależności npm, a testy używają wbudowanego `node:test`.
- Wersje rekordów dystrybucji zgadzają się z `3.0.0` po usunięciu opcjonalnych metadanych build Codexa.
- Łączny rozmiar `hooks/` i `skills/` nie przekracza 8 000 bajtów.

## Komendy wydania

```bash
npm test
uv run --with pyyaml python /Users/karolkiljan/.codex/skills/.system/skill-creator/scripts/quick_validate.py skills/krux
uv run --with pyyaml python /Users/karolkiljan/.codex/skills/.system/skill-creator/scripts/quick_validate.py skills/krux-horda
uv run --with pyyaml python /Users/karolkiljan/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py .
claude plugin validate .
python3 /Users/karolkiljan/.codex/skills/.system/plugin-creator/scripts/update_plugin_cachebuster.py .
npm run smoke:context -- --model gpt-5.6-sol
git diff --check
```
