# Eksperyment: KRUX_NATIVE_SKILL

## Cel

Sprawdzić empirycznie czy ręczne wstrzykiwanie SKILL.md przez `activate.js`
jest potrzebne. Hipoteza: Claude Code natywnie ładuje pluginowy skill przy
trafieniu kontekstu w opis — wstrzykiwanie może być duplikatem.

## Feature flag

`KRUX_NATIVE_SKILL=1` w env → `activate.js` (startup) emituje tylko
`KRUX TRYB AKTYWNY` bez body SKILL.md. Default (`KRUX_NATIVE_SKILL=0`/unset)
zachowuje obecny wstrzyk.

Implementacja: `hooks/activate.js` — gałąź `useNativeSkill`.

## Wymóg

Eksperyment wymaga **zadania 2** (`hooks/token-log.js`) jako narzędzia
pomiaru. Bez logu tokenów decyzja na ślepo.

## Procedura

1. **Baseline** (`KRUX_NATIVE_SKILL=0`).
   Przeprowadź 10 typowych sesji (mix: bug fix, refactor, nowy feature, code
   review). Zapisz `avg input_tokens` przy pierwszym promptcie sesji.

2. **Eksperyment** (`KRUX_NATIVE_SKILL=1`).
   Powtórz te same 10 sesji.

3. **Walidacja stylu**.
   W każdej sesji eksperymentu sprawdź czy Claude faktycznie używa stylu
   krux (łamana gramatyka, słownik, zero pierdołów). Styl rozjeżdża się →
   natywne ładowanie nie wystarczy.

4. **Decyzja**.
   - Style trzyma + tokeny niższe → usuń wstrzykiwanie z `activate.js`,
     zmień default na natywne (`useNativeSkill = true` zawsze).
   - Style się rozjeżdża → udokumentuj w CLAUDE.md DLACZEGO musisz wstrzykiwać
     (link do tego pliku).
   - Mieszane wyniki → zostaw flag dla power-userów (status quo).

## Wyniki

_Do wypełnienia po zebraniu danych._

| Sesja | NATIVE_SKILL | input_tokens (1st prompt) | Styl OK? |
|-------|--------------|----------------------------|----------|
| 1 | 0 | | |
| ... | | | |

## Decyzja końcowa

_Do zapisania w CLAUDE.md sekcja "Decyzje projektowe" po analizie._
