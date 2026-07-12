# CLAUDE.md — architektura pluginu krux

Ten plik to mapa dla maintainerów i dla Claude Code pracującego nad tym projektem. README.md jest dla użytkowników pluginu — ten plik jest dla osób które modyfikują plugin.

## Koncepcja — dwie ortogonalne osi

Plugin działa na dwóch niezależnych osiach:

1. **Persona krux** (skill `krux`) — kompresja tokenów przez ork persona + ultra-zwięzły styl. Stan: `~/.claude/.krux-mode` + `~/.claude/.krux-active`.
2. **Flow iteracyjny** (skill `krux-flow`) — tryb „jeden ruch na raz, bez upfront planu". Stan: `~/.claude/.krux-flow-active`.

**Te tryby są niezależne.** Flow może działać bez persony. Persona może działać bez flow. Obydwa mogą być aktywne jednocześnie. Nie mieszaj logiki toggle — każdy ma osobny hook (`krux-toggle.js`, `krux-flow-toggle.js`).

## Hooki — co odpala co

| Hook | Plik | Kiedy | Rola |
|------|------|-------|------|
| `SessionStart` | `hooks/activate.js` | start, resume, clear, compact | Wstrzykuje SKILL.md persony (startup/compact) lub krótki reminder (resume). Kopiuje statusline script do `~/.claude/`, proponuje setup jeśli brak. |
| `UserPromptSubmit` | `hooks/krux-toggle.js` | każdy prompt | Regex match na frazy toggle (`krux`, `stop krux`, itp.) → zmienia `.krux-mode` + `.krux-active` i wstrzykuje jawny stan persony. |
| `UserPromptSubmit` | `hooks/krux-flow-toggle.js` | każdy prompt | Regex match na frazy flow (`flow`, `stop flow`, itp.) → zmienia `.krux-flow-active`. Gdy flag aktywny, wstrzykuje per-turn reminder. |

**Kolejność UserPromptSubmit:** oba hooki (`krux-toggle`, `krux-flow-toggle`) odpalają równolegle. Nie zależą od siebie — każdy ogarnia swój regex i plik stanu.

**Rejestracja:** Wszystkie aktywne hooki runtime zdefiniowane w `hooks/hooks.json` (format zgodny z Claude Code plugin spec — ten sam kształt JSON co `settings.json` hooks). Ścieżka do plików JS przez `${CLAUDE_PLUGIN_ROOT}/hooks/...`. Nie duplikować rejestracji w `plugin.json` — jedno źródło prawdy.

## Stan — gdzie co żyje

| Plik | Kto pisze | Kto czyta | Cel |
|------|-----------|-----------|-----|
| `~/.claude/.krux-mode` | `krux-toggle.js` | `activate.js` | Trwały opt-in/out persony między sesjami (`on`/`off`). Jawny wybór z pliku ma pierwszeństwo przed `KRUX_DEFAULT_MODE`, które ustawia tylko stan początkowy. |
| `~/.claude/.krux-active` | `krux-toggle.js`, `activate.js` | statusline script | Runtime flag dla statusline badge `[KRUX]`. |
| `~/.claude/.krux-flow-active` | `krux-flow-toggle.js` | `krux-flow-toggle.js` | Per-turn reminder trigger dla trybu iteracyjnego. Istnienie pliku = ON. |
| `~/.claude/.krux-statusline-asked` | `activate.js` | `activate.js` | Marker że pluginowy prompt o statusline już wyleciał (nie nagaduj). |

**Asymetria:** `.krux-mode` jest trwałe (między sesjami), `.krux-active` to runtime-only flag dla UI. Slash command `/krux:krux` zapisuje tylko `.krux-active`, bez zmiany `.krux-mode`. Dzięki temu jednorazowa aktywacja nie nadpisuje globalnego opt-out użytkownika.

## Dystrybucja — Claude Code i Codex CLI

Ten sam plugin obsługuje dwa hosty przez dwa manifesty obok siebie: `.claude-plugin/plugin.json` (Claude Code) i `.codex-plugin/plugin.json` (Codex CLI). `hooks/` i `skills/` są fizycznie współdzielone — żadnej kopii treści. Jedyne naprawdę osobne artefakty to manifesty i orki (format subagentów się rozjeżdża, patrz niżej).

**Stan między hostami.** `hooks/lib/state-dir.js` eksportuje `stateDir()`: zwraca `process.env.PLUGIN_DATA` gdy ustawione (Codex ustawia ten host-neutralny, zapisywalny katalog per-plugin), inaczej `~/.claude/` (Claude Code, dzisiejsze zachowanie 1:1). `activate.js`, `krux-toggle.js`, `krux-flow-toggle.js` czytają katalog stanu przez ten resolver zamiast twardo kodować `~/.claude/`. Statusline (Claude-Code-specific, brak odpowiednika w Codex) jest owinięty w `if (!process.env.PLUGIN_DATA)` w `activate.js` — pod Codexem sekcja w ogóle się nie wykonuje.

**Orki pod Codex.** Codex nie ma granularnej listy `tools:` — ma tylko `sandbox_mode` (`read-only` | `workspace-write`). `agents/ork-*.md` (Markdown + frontmatter) zostaje jedynym źródłem prawdy dla obu hostów. `scripts/generate-codex-agents.js` czyta te pliki i pisze `agents-codex/*.toml` (format Codeksa: `name`, `description`, `sandbox_mode`, `developer_instructions`). Mapowanie `tools → sandbox_mode`: obecność `Edit` lub `Write` → `workspace-write`, inaczej → `read-only`. Wygenerowane `.toml` są **commitowane** (Codex czyta gotowe pliki, nie odpala generatora sam) — odśwież ręcznie przez `npm run generate:codex-agents` po każdej zmianie w `agents/ork-*.md`. Test `agents-codex-sync.test.js` pilnuje że commitowany output nie jest przestarzały, analogicznie do `triggers-sync.test.js`.

Design pełnego portu: `docs/specs/2026-07-12-codex-port-design.md` (lokalny, niecommitowany).

## Skille — jak są ze sobą powiązane

- `krux` — persona. Lean `SKILL.md` (Persona + 4 PRAWA głosu + hierarchia KODEKSU + Granice + odsyłacze) wstrzykiwany przez `activate.js` przy `startup`. **4 PRAWA** mówią jak Krux mówi; **KODEKS ROBOTY** mówi jak buduje. Szczegółowe CIĘCIA i kontrakt raportu są w `robota.md`, czytanym przy pracy z kodem. Pozostałe referencje (`moods.md`, `orchestration.md`, `auto-disable.md`, `context-watch.md`, `examples.md`) mają jawne warunki doczytania w rdzeniu. Feature flag `KRUX_NATIVE_SKILL=1` (eksperymentalny) wyłącza wstrzyk body; zachowanie osłania `test/activate.test.js`.
- `krux-flow` — orthogonal. Ma własny hook toggle. Skill dokumentuje zasady, hook wymusza je per-turn.

## Konwencje — co robić, czego nie

**Co robić:**
- Nowe hooki → `hooks/*.js`, wszystkie Node.js, bez zewnętrznych zależności (Claude Code dostarcza Node).
- Nowe skille → `skills/{name}/SKILL.md`. Slash `/krux:{name}` rejestrowany automatycznie. Nie dodawać `commands/` — legacy format, skill i tak wygrywa.
- Diacritics w regex → zawsze tolerować warianty: `[łl]`, `[ąa]` albo `(ł|l)`, `(ą|a)`. Nigdy `[ł|l]` — taki zbiór dopuszcza znak `|`. Wzorce są w `krux-toggle.js` i `krux-flow-toggle.js`.
- Stan w `~/.claude/` → ukryte pliki prefiksowane `.krux-`.
- Triggery orków → `agents/triggers.json` (single source of truth). Każde słowo z listy MUSI być w `description` agenta — test `triggers-sync.test.js` to wymusza. Tabela w README jest tylko dokumentacyjną kopią dla użytkownika.

**Czego nie robić:**
- Nie mieszać logiki persony i flow w jednym hooku.
- Nie nadpisywać `.krux-mode` bez wyraźnej intencji usera (slash command vs trigger phrase).
- Nie dodawać zależności npm — plugin ma być zero-install.
- Nie zakładać że `SessionStart.source` to zawsze `startup`. Rozróżniaj `startup|resume|clear|compact` w `activate.js`.

## Decyzje projektowe — dlaczego tak

**Resume → krótki reminder, compact → pełny reinject SKILL.md.** Przy resume skill już jest w pamięci modelu (kontekst persistuje). Compact przepisuje kontekst, więc `activate.js` ponownie wstrzykuje pełne SKILL.md, tak samo jak przy `startup`.

**Statusline copy przy aktywacji.** Settings wskazują na stabilną ścieżkę `~/.claude/.krux-statusline.sh` (Unix) albo `~/.claude/.krux-statusline.ps1` (Windows/PowerShell), a właściwy skrypt jest kopiowany z wersjonowanego cache pluginu na SessionStart. Ponowne wywołanie w ciągu 5 sekund pomija zbędną kopię. Update pluginu → update statusline bez zmiany settings.json.

## Testy

Framework: `node:test` (wbudowany, zero zależności zgodnie z konwencją zero-install). Uruchomienie: `npm test`. Glob w `package.json` używa podwójnych cudzysłowów, żeby działał także przez `cmd.exe` na Windows.

Pokrycie:
- `krux-toggle.js` — regex (diacritics, ASCII, case, full-match, trim), stan pliku, malformed stdin (`test/krux-toggle.test.js`)
- `krux-flow-toggle.js` — toggle flag, emit JSON, per-turn reminder, aliasy (katalog `test`, plik `krux-flow-toggle.test.js`)
- `activate.js` — getDefaultMode resolution order (env > plik > default), startup/compact vs resume branch, SKILL.md frontmatter strip, statusline copy, setup prompts (`test/activate.test.js`)
- `triggers-sync` — `agents/triggers.json` zsynchronizowany z `description` każdego orka (`test/triggers-sync.test.js`)
- `agents-shape` — walidacja frontmatter orków (name/description/model/color/tools, zakaz `<example>` i `user:`/`assistant:`, odsyłacz do `_common.md`, limit 50 linii body) (`test/agents-shape.test.js`)
- `integration` — testy integracyjne (opt-out persystencja, ortogonalność flow/persona, resume nie wstrzykuje SKILL.md) (`test/integration.test.js`)
- `plugin-contract` — synchronizacja 4 manifestów, cytowane i żywe komendy hooków, ścieżka pluginu ze spacją, frontmatter skilli zgodny z katalogiem (`test/plugin-contract.test.js`)
- `persona-contract` — rdzeń persony mały z jawnymi warunkami doczytania, hierarchia/raport/granice/model A-B-C, delegacja nie ucina raport do summary, ork dostaje jawny stan persony (`test/persona-contract.test.js`)
- `state-dir` — resolver katalogu stanu (`PLUGIN_DATA` vs `~/.claude/`) (`test/state-dir.test.js`)
- `codex-plugin-contract` — `.codex-plugin/plugin.json` istnieje, wymagane pola, ścieżki żywe (`test/codex-plugin-contract.test.js`)
- `agents-codex-sync` — `agents-codex/*.toml` zsynchronizowane z `agents/ork-*.md` (`test/agents-codex-sync.test.js`)

**Konwencja testowa:** spawn hook jako podprocess z izolowanym `HOME`, karm JSONem na stdin, asertuj plik stanu + exit code + stdout/stderr. Dla hooków czytających env: w `spawnSync` **strippuj ambient `KRUX_*`** z `process.env` — shell użytkownika może mieć np. `KRUX_DEFAULT_MODE=off` ustawione globalnie i zanieczyścić testy.

## Orki (subprocessy)

- Nazwa: **orki** — nie "agenci". Pasuje do persony.
- Armia 6 orków w `agents/ork-*.md`: tropiciel (debug + eksploracja kodu), kowal (backend), sedzia (review), malarz (frontend), tester (testy), burzyciel (refaktoring + martwy kod). **Mapowanie triggerów → `agents/triggers.json`** (single source of truth). Krux sam wybiera orka i model (`sonnet`/`opus`/`haiku`/`inherit`) przy `Agent` spawn.
- **Frontmatter orka — konwencja:** `description: >` (folded scalar) z listą triggerów po przecinku. **Nie używać** `<example>` / inline `user:`/`assistant:` w description — YAML parser Claude Code interpretuje je jako nested keys i cała description + pole `tools` nie łykają (efekt: auto-invocation po triggerach nie działa, ork wygląda jak generic „Agent from krux plugin" w system prompt).
- Orki zwracają standardowy JSON z kluczami `status` / `summary` / `details` / opcjonalnie `files` / `tests` / `verdict` — Krux parsuje `summary` dla usera, reszta dla niego.

## Wersjonowanie

`.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `package.json` i `.codex-plugin/plugin.json` muszą być zsynchronizowane. Plugin.json to źródło prawdy dla zainstalowanego pluginu Claude Code, marketplace.json dla listingu w `/plugin` UI (Claude Code czyta stąd wersję przy refresh marketplace), package.json dla npm-style metadanych, `.codex-plugin/plugin.json` dla instalacji przez Codex CLI. Bumpować wszystkie cztery razem ręcznie — test `plugin-contract.test.js` blokuje rozjazd wersji.

## Publikacja

Marketplace: `karolkiljan/krux` (patrz README). Nie publikujemy na npm (plugin nie jest npm package). Commity w stylu `feat: vX.Y.Z — opis` dla release'ów, zwykłe Conventional Commits dla reszty.
