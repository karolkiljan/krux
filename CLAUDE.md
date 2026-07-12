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
| `Stop` | `hooks/context_watch.js` | koniec tury modelu | Czyta tail transcriptu (128KB), sumuje `usage` tokenów. Gdy > threshold → ostrzeżenie przez stderr + exit 2. Cooldown 300s + delta 20k tokenów. |
| `PostToolUse` | `hooks/auto-test.js` | po Edit/Write/MultiEdit | Gdy zmieniony plik JS/JSON/MD w `hooks/`, `test/` lub `agents/` w repo `krux`, odpala `npm test`. Wynik (OK / tail padniętych) idzie do modelu przez JSON `additionalContext`. Opt-out: `KRUX_AUTO_TEST=off`. |

**Kolejność UserPromptSubmit:** oba hooki (`krux-toggle`, `krux-flow-toggle`) odpalają równolegle. Nie zależą od siebie — każdy ogarnia swój regex i plik stanu.

**Rejestracja:** Wszystkie aktywne hooki runtime zdefiniowane w `hooks/hooks.json` (format zgodny z Claude Code plugin spec — ten sam kształt JSON co `settings.json` hooks). Ścieżka do plików JS przez `${CLAUDE_PLUGIN_ROOT}/hooks/...`. Nie duplikować rejestracji w `plugin.json` — jedno źródło prawdy.

## Stan — gdzie co żyje

| Plik | Kto pisze | Kto czyta | Cel |
|------|-----------|-----------|-----|
| `~/.claude/.krux-mode` | `krux-toggle.js` | `krux-config.js`, `context_watch.js` | Trwały opt-in/out persony między sesjami (`on`/`off`). Jawny wybór z pliku ma pierwszeństwo przed `KRUX_DEFAULT_MODE`, które ustawia tylko stan początkowy. |
| `~/.claude/.krux-active` | `krux-toggle.js`, `activate.js` | statusline script | Runtime flag dla statusline badge `[KRUX]`. |
| `~/.claude/.krux-flow-active` | `krux-flow-toggle.js` | `krux-flow-toggle.js` | Per-turn reminder trigger dla trybu iteracyjnego. Istnienie pliku = ON. |
| `~/.claude/.krux-statusline-asked` | `activate.js` | `activate.js` | Marker że pluginowy prompt o statusline już wyleciał (nie nagaduj). |
| `~/.claude/.krux-context-watch-off` | user, `krux-context-threshold` | `context_watch.js` | Marker opt-out samego context_watch (persona dalej działa). Istnienie = OFF. Powstał, bo env z settings.json nie dociera do child procesów hooków. |
| `~/.claude/.krux-context-threshold` | user, `krux-context-threshold` | `context_watch.js` | Override wartości progu (jedna liczba). Precedencja: plik > env > default 85000. Nie wymaga restartu Claude Code. |
| `{transcript_dir}/{session_id}.context_watch_ts` | `context_watch.js` | `context_watch.js` | Stan cooldownu (`timestamp:lastTokens`). Per-sesja. |

**Asymetria:** `.krux-mode` jest trwałe (między sesjami), `.krux-active` to runtime-only flag dla UI. Slash command `/krux:krux` zapisuje tylko `.krux-active`, bez zmiany `.krux-mode`. Dzięki temu jednorazowa aktywacja nie nadpisuje globalnego opt-out użytkownika.

## Skille — jak są ze sobą powiązane

- `krux` — persona. Lean `SKILL.md` (Persona + 4 PRAWA głosu + hierarchia KODEKSU + Granice + odsyłacze) wstrzykiwany przez `activate.js` przy `startup`. **4 PRAWA** mówią jak Krux mówi; **KODEKS ROBOTY** mówi jak buduje. Szczegółowe CIĘCIA i kontrakt raportu są w `robota.md`, czytanym przy pracy z kodem. Pozostałe referencje (`moods.md`, `orchestration.md`, `auto-disable.md`, `context-watch.md`, `examples.md`) mają jawne warunki doczytania w rdzeniu. Feature flag `KRUX_NATIVE_SKILL=1` (eksperymentalny) wyłącza wstrzyk body; zachowanie osłania `test/activate.test.js`.
- `krux-flow` — orthogonal. Ma własny hook toggle. Skill dokumentuje zasady, hook wymusza je per-turn.
- `krux-rysownik` — buduje samodzielne diagramy HTML z deklaratywnej sceny JSON; renderer i przykłady są zasobami bundlowanymi ze skillem.
- `krux-commit`, `krux-review`, `krux-compress`, `krux-help`, `krux-context-threshold`, `krux-bump`, `krux-release` — sloty komend. Każdy skill rejestruje slash `/krux:{name}` automatycznie (spec: skill taking precedence over commands/). Argumenty przez `$ARGUMENTS` w SKILL.md, autocomplete hint przez `argument-hint` we frontmatterze.
- `krux-context-threshold` — jedyny skill modyfikujący konfigurację. Zapisuje `~/.claude/.krux-context-threshold` (plik z wartością progu) i `~/.claude/.krux-context-watch-off` (marker opt-out). Nie dotyka `settings.json`.
- `krux-bump` — atomowy bump wersji w `package.json` + `.claude-plugin/plugin.json` + `.claude-plugin/marketplace.json`. Przyjmuje `patch|minor|major|X.Y.Z`. Egzekwuje wymóg z sekcji "Wersjonowanie" — wersje rozjechane → przerwa.
- `krux-release` — workflow release: `krux-bump` → commit `feat: vX.Y.Z — opis` → tag `vX.Y.Z`. Nie push-uje automatycznie.

## Konwencje — co robić, czego nie

**Co robić:**
- Nowe hooki → `hooks/*.js`, wszystkie Node.js, bez zewnętrznych zależności (Claude Code dostarcza Node).
- Nowe skille → `skills/{name}/SKILL.md`. Slash `/krux:{name}` rejestrowany automatycznie. Nie dodawać `commands/` — legacy format, skill i tak wygrywa.
- Diacritics w regex → zawsze tolerować warianty: `[łl]`, `[ąa]` albo `(ł|l)`, `(ą|a)`. Nigdy `[ł|l]` — taki zbiór dopuszcza znak `|`. Wzorce są w `krux-toggle.js` i `krux-flow-toggle.js`.
- Stan w `~/.claude/` → ukryte pliki prefiksowane `.krux-`.
- Triggery orków → `agents/triggers.json` (single source of truth). Każde słowo z listy MUSI być w `description` agenta — test `triggers-sync.test.js` to wymusza. Tabela w README jest tylko dokumentacyjną kopią dla użytkownika.

**Czego nie robić:**
- Nie mieszać logiki persony i flow w jednym hooku.
- Nie czytać całego transcriptu JSONL — tylko tail w `context_watch.js`. W długich sesjach cały JSONL to MB.
- Nie nadpisywać `.krux-mode` bez wyraźnej intencji usera (slash command vs trigger phrase).
- Nie dodawać zależności npm — plugin ma być zero-install.
- Nie zakładać że `SessionStart.source` to zawsze `startup`. Rozróżniaj `startup|resume|clear|compact` w `activate.js`.

## Decyzje projektowe — dlaczego tak

**Cooldown + delta w context_watch.** Sam cooldown nie wystarczy — gdy user się cofa lub /compacts, tokeny spadają i cooldown nadal blokuje. Delta 20k pozwala re-fire gdy kontekst faktycznie urósł, mimo niewygasłego cooldownu.

**Tail-only parsing transcriptu.** Freshest `usage` entry zawsze na końcu. 128KB tail pokrywa kilka ostatnich tur nawet przy dużych payloadach.

**Resume → krótki reminder, compact → pełny reinject SKILL.md.** Przy resume skill już jest w pamięci modelu (kontekst persistuje). Compact przepisuje kontekst, więc `activate.js` ponownie wstrzykuje pełne SKILL.md, tak samo jak przy `startup`.

**File-based opt-out i threshold dla context_watch.** Claude Code nie propaguje `env` z `settings.json` do child procesów hooków (empiryczne: `process.env.KRUX_CONTEXT_THRESHOLD` i `KRUX_CONTEXT_WATCH` puste w hooku mimo ustawienia w settings). Dlatego `context_watch.js` czyta pliki w `~/.claude/`: `.krux-context-watch-off` (marker opt-out, sprawdzany przed env) i `.krux-context-threshold` (wartość progu, precedencja plik > env > default). Zaletę: zmiana działa od razu, bez restartu Claude Code — następny Stop hook już widzi nową wartość.

**Statusline copy przy aktywacji.** Settings wskazują na stabilną ścieżkę `~/.claude/.krux-statusline.sh` (Unix) albo `~/.claude/.krux-statusline.ps1` (Windows/PowerShell), a właściwy skrypt jest kopiowany z wersjonowanego cache pluginu na SessionStart. Ponowne wywołanie w ciągu 5 sekund pomija zbędną kopię. Update pluginu → update statusline bez zmiany settings.json.

## Testy

Framework: `node:test` (wbudowany, zero zależności zgodnie z konwencją zero-install). Uruchomienie: `npm test`. Glob w `package.json` używa podwójnych cudzysłowów, żeby działał także przez `cmd.exe` na Windows.

Pokrycie:
- `krux-toggle.js` — regex (diacritics, ASCII, case, full-match, trim), stan pliku, malformed stdin (`test/krux-toggle.test.js`)
- `krux-flow-toggle.js` — toggle flag, emit JSON, per-turn reminder, aliasy (katalog `test`, plik `krux-flow-toggle.test.js`)
- `krux-config.js` — getDefaultMode resolution order (env > plik > default) (`test/krux-config.test.js`)
- `context_watch.js` — opt-out (env + mode), threshold, transcript parsing (JSONL, malformed lines, message.usage vs top-level), cooldown + delta logic (`test/context-watch.test.js`)
- `activate.js` — startup/compact vs resume branch, SKILL.md frontmatter strip, statusline copy, setup prompts (`test/activate.test.js`)
- `auto-test.js` — matcher ścieżki (`hooks/*.js`, `test/*.js`, `agents/*.{md,json}`), spawn `npm test`, propagacja wyniku, ETIMEDOUT z `KRUX_AUTO_TEST_TIMEOUT_MS`, opt-out `KRUX_AUTO_TEST=off`, guard „nie repo krux" (`test/auto-test.test.js`)
- `triggers-sync` — `agents/triggers.json` zsynchronizowany z `description` każdego orka (`test/triggers-sync.test.js`)
- `agents-shape` — walidacja frontmatter orków (name/description/model/color/tools, zakaz `<example>` i `user:`/`assistant:`, odsyłacz do `_common.md`, limit 50 linii body) (`test/agents-shape.test.js`)
- `integration` — testy integracyjne (opt-out persystencja, ortogonalność flow/persona, resume nie wstrzykuje SKILL.md) (`test/integration.test.js`)
- `plugin-contract` — synchronizacja 3 manifestów, cytowane i żywe komendy hooków, ścieżka pluginu ze spacją, komendy user-only i kontrakt release (`test/plugin-contract.test.js`)
- `persona-contract` — rdzeń persony mały z jawnymi warunkami doczytania, hierarchia/raport/granice/model A-B-C, delegacja nie ucina raport do summary, ork dostaje jawny stan persony (`test/persona-contract.test.js`)
- `rysownik` — build wszystkich przykładowych scen oraz kontrolowane błędy walidacji (`test/rysownik.test.js`)

**Konwencja testowa:** spawn hook jako podprocess z izolowanym `HOME`, karm JSONem na stdin, asertuj plik stanu + exit code + stdout/stderr. Dla hooków czytających env: w `spawnSync` **strippuj ambient `KRUX_*`** z `process.env` — shell użytkownika może mieć np. `KRUX_CONTEXT_WATCH=off` ustawione globalnie i zanieczyścić testy.

## Orki (subprocessy)

- Nazwa: **orki** — nie "agenci". Pasuje do persony.
- Armia 14 orków w `agents/ork-*.md`. **Mapowanie triggerów → `agents/triggers.json`** (single source of truth). Krux sam wybiera orka i model (`sonnet`/`opus`/`haiku`/`inherit`) przy `Agent` spawn.
- **Frontmatter orka — konwencja:** `description: >` (folded scalar) z listą triggerów po przecinku. **Nie używać** `<example>` / inline `user:`/`assistant:` w description — YAML parser Claude Code interpretuje je jako nested keys i cała description + pole `tools` nie łykają (efekt: auto-invocation po triggerach nie działa, ork wygląda jak generic „Agent from krux plugin" w system prompt).
- `agents/ork-straznik.md` — specjalistyczny reviewer hooków Claude Code. Uruchamiany po każdej zmianie w `hooks/*.js` albo na żądanie. Audytuje: stdin JSON contract, exit codes, timeout awareness, tail-only transcript parsing, diacritics w regex, lokalizację stanu, zero-dep, rozdzielność logiki persony/flow, pokrycie testami. Nie modyfikuje plików — tylko raport.
- Orki zwracają standardowy JSON z kluczami `status` / `summary` / `details` / opcjonalnie `files` / `tests` / `verdict` — Krux parsuje `summary` dla usera, reszta dla niego.

## Wersjonowanie

`.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json` i `package.json` muszą być zsynchronizowane. Plugin.json to źródło prawdy dla zainstalowanego pluginu, marketplace.json dla listingu w `/plugin` UI (Claude Code czyta stąd wersję przy refresh marketplace), package.json dla npm-style metadanych. Bumpować wszystkie razem — najłatwiej przez `/krux:krux-bump` albo `/krux:krux-release`.

## Publikacja

Marketplace: `karolkiljan/krux` (patrz README). Nie publikujemy na npm (plugin nie jest npm package). Commity w stylu `feat: vX.Y.Z — opis` dla release'ów, zwykłe Conventional Commits dla reszty.
