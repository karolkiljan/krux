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
| `SessionStart` | `hooks/activate.js` | start, resume, clear, compact | Wstrzykuje SKILL.md persony (startup) lub krótki reminder (resume/compact). Kopiuje statusline script do `~/.claude/`, proponuje setup jeśli brak. |
| `UserPromptSubmit` | `hooks/krux-toggle.js` | każdy prompt | Regex match na frazy toggle (`krux`, `stop krux`, itp.) → zmienia `.krux-mode` + `.krux-active`. |
| `UserPromptSubmit` | `hooks/krux-flow-toggle.js` | każdy prompt | Regex match na frazy flow (`flow`, `stop flow`, itp.) → zmienia `.krux-flow-active`. Gdy flag aktywny, wstrzykuje per-turn reminder. |
| `Stop` | `hooks/context_watch.js` | koniec tury modelu | Czyta tail transcriptu (128KB), sumuje `usage` tokenów. Gdy > threshold → ostrzeżenie przez stderr + exit 2. Cooldown 300s + delta 20k tokenów. |
| `PreCompact` | `hooks/precompact.js` | przed /compact | Odczytuje `{cwd}/.claude/compact_notes.md` i wstrzykuje do summary. Kasuje plik po użyciu (notatki jednorazowe). |
| `PreToolUse` | `hooks/version-sync-guard.js` | przed Edit/Write/MultiEdit | Gdy edytowany `package.json` lub `.claude-plugin/plugin.json`, porównuje ich wersje. Rozjazd → exit 2 z instrukcją `/krux-bump`. Chroni wymóg synchronizacji. |
| `PostToolUse` | `hooks/auto-test.js` | po Edit/Write/MultiEdit | Gdy zmieniony plik w `hooks/*.js` lub `test/*.js` w repo `krux`, odpala `npm test`. Wynik (OK / tail padniętych) idzie do modelu przez stdout. Opt-out: `KRUX_AUTO_TEST=off`. |

**Kolejność UserPromptSubmit:** oba hooki (`krux-toggle`, `krux-flow-toggle`) odpalają równolegle. Nie zależą od siebie — każdy ogarnia swój regex i plik stanu.

**Rejestracja:** Wszystkie hooki zdefiniowane w `hooks/hooks.json` (format zgodny z Claude Code plugin spec — ten sam kształt JSON co `settings.json` hooks). Ścieżka do plików JS przez `${CLAUDE_PLUGIN_ROOT}/hooks/...`. Nie duplikować rejestracji w `plugin.json` — jedno źródło prawdy.

## Stan — gdzie co żyje

| Plik | Kto pisze | Kto czyta | Cel |
|------|-----------|-----------|-----|
| `~/.claude/.krux-mode` | `krux-toggle.js`, `activate.js` | `krux-config.js`, `context_watch.js` | Trwały opt-in/out persony między sesjami (`on`/`off`). |
| `~/.claude/.krux-active` | `krux-toggle.js`, `activate.js` | statusline script | Runtime flag dla statusline badge `[KRUX]`. |
| `~/.claude/.krux-flow-active` | `krux-flow-toggle.js` | `krux-flow-toggle.js` | Per-turn reminder trigger dla trybu iteracyjnego. Istnienie pliku = ON. |
| `~/.claude/.krux-statusline-asked` | `activate.js` | `activate.js` | Marker że pluginowy prompt o statusline już wyleciał (nie nagaduj). |
| `~/.claude/.krux-context-watch-off` | user, `krux-context-threshold` | `context_watch.js` | Marker opt-out samego context_watch (persona dalej działa). Istnienie = OFF. Powstał, bo env z settings.json nie dociera do child procesów hooków. |
| `~/.claude/.krux-context-threshold` | user, `krux-context-threshold` | `context_watch.js` | Override wartości progu (jedna liczba). Precedencja: plik > env > default 85000. Nie wymaga restartu Claude Code. |
| `{transcript_dir}/{session_id}.context_watch_ts` | `context_watch.js` | `context_watch.js` | Stan cooldownu (`timestamp:lastTokens`). Per-sesja. |
| `{cwd}/.claude/compact_notes.md` | user/model | `precompact.js` | Notatki dla PreCompact. Jednorazowe — hook kasuje po użyciu. |

**Asymetria:** `.krux-mode` jest trwałe (między sesjami), `.krux-active` to runtime-only flag dla UI. Slash command `/krux:krux` włącza tylko `.krux-active` (jednorazowe), nie pisze do `.krux-mode`. Dzięki temu jednorazowa aktywacja nie nadpisuje globalnego opt-out użytkownika.

## Skille — jak są ze sobą powiązane

- `krux` — persona. Jedyny skill z pełnym SKILL.md wstrzykiwanym przez `activate.js`. Inne skille korzystają z jej stylu, jeśli persona aktywna.
- `krux-flow` — orthogonal. Ma własny hook toggle. Skill dokumentuje zasady, hook wymusza je per-turn.
- `krux-commit`, `krux-review`, `krux-compress`, `krux-help`, `krux-context-threshold`, `krux-bump`, `krux-release` — sloty komend. Każdy skill rejestruje slash `/krux:{name}` automatycznie (spec: skill taking precedence over commands/). Argumenty przez `$ARGUMENTS` w SKILL.md, autocomplete hint przez `argument-hint` we frontmatterze.
- `krux-context-threshold` — jedyny skill modyfikujący konfigurację. Używa `bin/krux-detect-settings` (wykrywa właściwy `settings.json` — projekt vs user-level) i zmienia zmienną `KRUX_CONTEXT_THRESHOLD`.
- `krux-bump` — atomowy bump wersji w `package.json` + `.claude-plugin/plugin.json`. Przyjmuje `patch|minor|major|X.Y.Z`. Egzekwuje wymóg z sekcji "Wersjonowanie" — wersje rozjechane → przerwa.
- `krux-release` — workflow release: `krux-bump` → commit `feat: vX.Y.Z — opis` → tag `vX.Y.Z`. Nie push-uje automatycznie.

## Konwencje — co robić, czego nie

**Co robić:**
- Nowe hooki → `hooks/*.js`, wszystkie Node.js, bez zewnętrznych zależności (Claude Code dostarcza Node).
- Nowe skille → `skills/{name}/SKILL.md`. Slash `/krux:{name}` rejestrowany automatycznie. Nie dodawać `commands/` — legacy format, skill i tak wygrywa.
- Diacritics w regex → zawsze tolerować opcjonalność: `[ł|l]`, `[ą|a]`. Wzorce: `krux-toggle.js:27-28`, `krux-flow-toggle.js:31-32`.
- Stan w `~/.claude/` → ukryte pliki prefiksowane `.krux-`.

**Czego nie robić:**
- Nie mieszać logiki persony i flow w jednym hooku.
- Nie czytać całego transcriptu JSONL — tylko tail (`context_watch.js:58-72`). W długich sesjach cały JSONL to MB.
- Nie nadpisywać `.krux-mode` bez wyraźnej intencji usera (slash command vs trigger phrase).
- Nie dodawać zależności npm — plugin ma być zero-install.
- Nie zakładać że `SessionStart.source` to zawsze `startup`. Rozróżniaj `startup|resume|clear|compact` (`activate.js:28-42`).

## Decyzje projektowe — dlaczego tak

**Cooldown + delta w context_watch.** Sam cooldown nie wystarczy — gdy user się cofa lub /compacts, tokeny spadają i cooldown nadal blokuje. Delta 20k pozwala re-fire gdy kontekst faktycznie urósł, mimo niewygasłego cooldownu (`context_watch.js:96-98`).

**Tail-only parsing transcriptu.** Freshest `usage` entry zawsze na końcu. 128KB tail pokrywa kilka ostatnich tur nawet przy dużych payloadach (`context_watch.js:58-72`).

**Resume/compact → krótki reminder zamiast pełnego SKILL.md.** Przy resume skill już jest w pamięci modelu (kontekst persistuje). Przy compact PreCompact hook wstrzykuje notatki. Pełne SKILL.md tylko przy `startup` (`activate.js:41-55`).

**File-based opt-out i threshold dla context_watch.** Claude Code nie propaguje `env` z `settings.json` do child procesów hooków (empiryczne: `process.env.KRUX_CONTEXT_THRESHOLD` i `KRUX_CONTEXT_WATCH` puste w hooku mimo ustawienia w settings). Dlatego `context_watch.js` czyta pliki w `~/.claude/`: `.krux-context-watch-off` (marker opt-out, sprawdzany przed env) i `.krux-context-threshold` (wartość progu, precedencja plik > env > default). Zaletę: zmiana działa od razu, bez restartu Claude Code — następny Stop hook już widzi nową wartość.

**Statusline copy na każdym starcie.** Settings wskazują na stabilną ścieżkę `~/.claude/.krux-statusline.sh`, ale sam skrypt jest kopiowany z wersjonowanego cache pluginu na każdym SessionStart. Update pluginu → update statusline bez zmiany settings.json (`activate.js:57-101`).

## Testy

Framework: `node:test` (wbudowany, zero zależności zgodnie z konwencją zero-install). Uruchomienie: `npm test`.

Pokryte hooki:
- `krux-toggle.js` — regex (diacritics, ASCII, case, full-match, trim), stan pliku, malformed stdin (`test/krux-toggle.test.js`)
- `krux-flow-toggle.js` — toggle flag, emit JSON, per-turn reminder, aliasy (`test/krux-flow-toggle.test.js`)
- `krux-config.js` — getDefaultMode resolution order (env > plik > default) (`test/krux-config.test.js`)
- `context_watch.js` — opt-out (env + mode), threshold, transcript parsing (JSONL, malformed lines, message.usage vs top-level), cooldown + delta logic (`test/context-watch.test.js`)
- `precompact.js` — notes injection + one-shot deletion, empty file edge case (`test/precompact.test.js`)
- `activate.js` — startup vs resume/compact branch, SKILL.md frontmatter strip, statusline copy, setup prompts (`test/activate.test.js`)
- `version-sync-guard.js` — detekcja strzeżonych ścieżek, porównanie wersji, blok exit 2, edge case brakujących plików (`test/version-sync-guard.test.js`)
- `auto-test.js` — matcher ścieżki (`hooks/*.js`, `test/*.js`), spawn `npm test`, propagacja wyniku, opt-out `KRUX_AUTO_TEST=off`, guard „nie repo krux" (`test/auto-test.test.js`)

**Konwencja testowa:** spawn hook jako podprocess z izolowanym `HOME`, karm JSONem na stdin, asertuj plik stanu + exit code + stdout/stderr. Dla hooków czytających env: w `spawnSync` **strippuj ambient `KRUX_*`** z `process.env` — shell użytkownika może mieć np. `KRUX_CONTEXT_WATCH=off` ustawione globalnie i zanieczyścić testy.

## Orki (subprocessy)

- Nazwa: **orki** — nie "agenci". Pasuje do persony.
- `agents/hook-validator.md` — specjalistyczny reviewer hooków Claude Code. Uruchamiany po każdej zmianie w `hooks/*.js` albo na życzenie. Audytuje: stdin JSON contract, exit codes, timeout awareness, tail-only transcript parsing, diacritics w regex, lokalizację stanu, zero-dep, rozdzielność logiki persony/flow, pokrycie testami. Nie modyfikuje plików — tylko raport.

## Wersjonowanie

`.claude-plugin/plugin.json` i `package.json` muszą być zsynchronizowane. Plugin.json to źródło prawdy dla Claude Code marketplace, package.json dla npm-style metadanych. Bumpować razem — najłatwiej przez `/krux-bump` albo `/krux-release`. Hook `version-sync-guard` blokuje edycję gdy wersje już rozjechane.

## Publikacja

Marketplace: `karolkiljan/krux` (patrz README). Nie publikujemy na npm (plugin nie jest npm package). Commity w stylu `feat: vX.Y.Z — opis` dla release'ów, zwykłe Conventional Commits dla reszty.
