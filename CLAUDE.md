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
test/{hook,horda,contract,smoke}.test.js      testy deterministyczne
scripts/context-smoke.js                      pomiar 12 tur
docs/superpowers/{specs,plans}/               dokumenty projektowe (śledzone mimo wpisu w .gitignore)
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
| `UserPromptSubmit` | dowolny inny tekst, flaga persony `on` | krótka kotwica głosu (trzecia osoba, złamana gramatyka, rdzeń słownika) |
| `UserPromptSubmit` | dowolny inny tekst, flaga persony `off` | brak |
| każde inne wejście | dowolne | brak |

`SessionStart(startup|clear|compact)`, sześć dokładnych komend toggle i każda inna tura `UserPromptSubmit` przy włączonej personie mogą emitować kontekst. Kotwica głosu jest statyczna (bez stanu, bez licznika tur) — przeciwdziała temu, że pojedyncza iniekcja na starcie sesji traci wagę po kilku turach z dużą ilością tokenów narzędziowych między nimi.

## Reguła stanu

Trzy niezależne flagi w `<plugin-data>/`: `.krux-mode` (persona, treść `on`/`off`, brak pliku = `on`), `.krux-konkret` i `.krux-flow` (zakres i rytm, sama obecność pliku = `on`, brak = `off`). Błąd odczytu bezpiecznie wyłącza emisję. Błąd zapisu nie blokuje bieżącej instrukcji, lecz nie udaje trwałości.

## Niezmienniki

- `hooks/hooks.json` jest odkrywany przez oba hosty: Claude Code i Codex.
- `hooks/krux.js` przyjmuje obie rodziny zmiennych: `CLAUDE_PLUGIN_ROOT` / `CLAUDE_PLUGIN_DATA` oraz `PLUGIN_ROOT` / `PLUGIN_DATA`.
- Body `skills/krux/SKILL.md` po frontmatter jest jedynym źródłem głosu.
- Body `skills/krux-konkret/SKILL.md` i `skills/krux-flow/SKILL.md` po frontmatter są jedynym źródłem kontraktów trybów — hook nie przechowuje ich kopii.
- Instrukcje w `skills/krux/SKILL.md` pisze się poprawną polszczyzną; głos orka niosą wyłącznie pary przykładów. Opisywanie głosu przymiotnikami zamiast pokazania wzorca jest regresem — patrz `docs/superpowers/specs/2026-07-16-persona-kapsula-design.md`.
- Horda pozostaje w `skills/krux-horda/SKILL.md` i ładuje się wyłącznie na żądanie.
- `krux-konkret` i `krux-flow` to niezależne, składalne osie — nie zmieniają głosu ani nie zależą od siebie nawzajem.
- Claude Code tnie output hooka powyżej 10 000 znaków: pełny tekst ląduje w pliku sesji, model dostaje 2 KB podglądu. Dlatego łączna emisja `SessionStart` (persona + konkret + flow) i każda emisja toggle mieszczą się w budżecie 9 000 znaków, a kotwica głosu w 1 000 — pilnuje tego test kontraktowy. Powiększenie body `SessionStart` wymaga wycięcia czegoś w zamian, bo tam budżet wynika z cap-u harnessa. Budżet kotwicy jest inny: wynika z kosztu na turę (~250 tokenów), nie z cap-u, i wolno go podnieść świadomie — poprzednie 300 było liczbą wymyśloną, przez którą wycinano działające pary.
- `scripts/context-smoke.js` ma dwa scenariusze: `cache` (domyślny) i `kolejka`. Domyślnego się nie zmienia — wszystkie przebiegi w `benchmarks/context-smoke/` do 3.7.0 stoją na `cache` i podmiana zerwałaby porównywalność. `kolejka` niesie cztery liczby poboczne (`prefetch: 12`, `concurrency: 4`, `amqplib 0.10.4`, dosłowny komunikat z logu) zamiast jednej. Sąd na nim rozstrzygnął się remisem 98:98 i **nie różnicuje kotwic**: tury 7 i 8 pytają o te liczby wprost, a konkret zamówiony wprost podaje każda kotwica. Kolejny scenariusz pomiarowy musi wprowadzać liczby poboczne mimochodem — szczegóły w `docs/superpowers/specs/2026-07-26-sad-czytelnosci-kotwicy.md`. Raport zawsze nazywa scenariusz w polu `scenario`.
- Runtime nie ma zależności npm, a testy używają wbudowanego `node:test`.
- Wersje rekordów dystrybucji zgadzają się z `3.7.0` po usunięciu opcjonalnych metadanych build Codexa.

## Komendy wydania

```bash
npm test
uv run --with pyyaml python $HOME/.codex/skills/.system/skill-creator/scripts/quick_validate.py skills/krux
uv run --with pyyaml python $HOME/.codex/skills/.system/skill-creator/scripts/quick_validate.py skills/krux-horda
uv run --with pyyaml python $HOME/.codex/skills/.system/skill-creator/scripts/quick_validate.py skills/krux-konkret
uv run --with pyyaml python $HOME/.codex/skills/.system/skill-creator/scripts/quick_validate.py skills/krux-flow
uv run --with pyyaml python $HOME/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py .
claude plugin validate .
python3 $HOME/.codex/skills/.system/plugin-creator/scripts/update_plugin_cachebuster.py .
npm run smoke:context -- --model gpt-5.6-sol
npm run smoke:context -- --model gpt-5.6-sol --scenario kolejka
git diff --check
```
