# CLAUDE.md — architektura pluginu krux

Ten plik to mapa dla maintainerów oraz agentów pracujących nad pluginem dla Claude Code i Codex. README.md jest dla użytkowników pluginu — ten plik jest dla osób które modyfikują plugin.

## Koncepcja — trzy ortogonalne osie

Plugin działa na trzech niezależnych osiach:

1. **Persona krux** (skill `krux`) — kompresja tokenów przez ork persona + ultra-zwięzły styl. Stan: `<stateDir>/.krux-mode` + `<stateDir>/.krux-active`.
2. **Flow iteracyjny** (skill `krux-flow`) — tryb „jeden ruch na raz, bez upfront planu". Stan: `<stateDir>/.krux-flow-active`.
3. **Konkret** (skill `krux-konkret`) — tryb chirurgicznej precyzji zakresu:
   dokładnie to o co user prosił, najprostszym działającym sposobem, rzeczy
   obok tylko raportowane. Stan: `<stateDir>/.krux-konkret-active`.

**Te tryby są niezależne.** Każda kombinacja osi może być aktywna jednocześnie. Nie mieszaj logiki toggle — każdy ma osobny hook (`krux-toggle.js`, `krux-flow-toggle.js`, `krux-konkret-toggle.js`).

## Hooki — co odpala co

| Hook | Plik | Kiedy | Rola |
|------|------|-------|------|
| `SessionStart` | `hooks/activate.js` | start, resume, clear, compact | Wstrzykuje SKILL.md persony (startup/compact) lub krótki reminder (resume). Resetuje licznik turnów drift-guard (`.krux-turn-count`) — każde wstrzyknięcie to świeże wzmocnienie. Kopiuje statusline script do `~/.claude/`, proponuje setup jeśli brak. |
| `UserPromptSubmit` | `hooks/krux-toggle.js` | każdy prompt | Regex match na frazy toggle (`krux`, `stop krux`, itp.) → zmienia `.krux-mode` + `.krux-active` i wstrzykuje jawny stan persony (reset licznika drift-guard). Inaczej, gdy persona aktywna: liczy tury tej sesji od ostatniego wzmocnienia (`hooks/lib/drift-guard.js`, klucz `session_id`). Tury poniżej progu dostają dodatnią kotwicę `KRUX TURN`: tożsamość + dodatni przykład + kontrakt zadania. Po progu (`KRUX_DRIFT_INTERVAL`, domyślnie 10) zastępuje ją pełny `KRUX DRIFT-GUARD` z 4 PRAWAMI i kolejnym przykładem (`MICRO_EXAMPLES`, licznik emisji w `.krux-drift-emit`). `KRUX_TURN_REMINDER=0` wyłącza tylko lekką kotwicę; pełna zostaje. |
| `UserPromptSubmit` | `hooks/krux-flow-toggle.js` | każdy prompt | Regex match na frazy flow (`flow`, `stop flow`, itp.) → zmienia `.krux-flow-active`. Gdy flag aktywny, wstrzykuje per-turn reminder. |
| `UserPromptSubmit` | `hooks/krux-konkret-toggle.js` | każdy prompt | Regex match na frazy konkret (`konkret`, `strict`, `konkret off`, itp.) → zmienia `.krux-konkret-active`. Gdy flag aktywny, wstrzykuje per-turn reminder kontraktu zakresu (tylko A, najprostsze, obok = 1 linia raportu, delegacja dziedziczy kontrakt). |
| `UserPromptSubmit` | `hooks/krux-horda-trigger.js` | każdy prompt | Match słów promptu na triggery z `agents/triggers.json` (word-boundary, fold diakrytyków; fleksja celowo nieobsługiwana) → wstrzykuje podpowiedź delegacji z bramką korzyści. Throttle per-sesja: 1 nudge / `KRUX_HORDA_NUDGE_INTERVAL` (domyślnie 5) turnów. `KRUX_HORDA_NUDGE=0` wyłącza. Niezależny od stanu persony. |

**Kolejność UserPromptSubmit:** hooki toggle (`krux-toggle`, `krux-flow-toggle`, `krux-konkret-toggle`) odpalają równolegle. Nie zależą od siebie — każdy ogarnia swój regex i plik stanu.

**Rejestracja:** Wszystkie aktywne hooki runtime zdefiniowane w `hooks/hooks.json` (format zgodny z Claude Code plugin spec — ten sam kształt JSON co `settings.json` hooks). Ścieżka do plików JS przez `${CLAUDE_PLUGIN_ROOT}/hooks/...`. Nie duplikować rejestracji w `plugin.json` — jedno źródło prawdy.

## Stan — gdzie co żyje

| Plik | Kto pisze | Kto czyta | Cel |
|------|-----------|-----------|-----|
| `<stateDir>/.krux-mode` | `krux-toggle.js` | `activate.js` | Trwały opt-in/out persony między sesjami (`on`/`off`). Jawny wybór z pliku ma pierwszeństwo przed `KRUX_DEFAULT_MODE`, które ustawia tylko stan początkowy. |
| `<stateDir>/.krux-active` | `krux-toggle.js`, `activate.js` | statusline script tylko pod Claude | Globalny runtime flag — od v2.10.0 czyta go WYŁĄCZNIE statusline (bash bez session_id, ostatnia akcja wygrywa). Gate reminderów siedzi w `.krux-active-sessions`. |
| `<stateDir>/.krux-active-sessions` | `krux-toggle.js`, `activate.js` (`hooks/lib/drift-guard.js`) | `krux-toggle.js` | Per-sesyjny gate per-turn reminderów (JSON map per `session_id`, TTL 24h odświeżany na SessionStart). Wstrzyknięcie SKILL.md jest per-sesja, więc one-shot w sesji A nie szumi reminderami w sesji B; `stop krux` w A nie wycisza żywej sesji B. |
| `<stateDir>/.krux-flow-active` | `krux-flow-toggle.js` | `krux-flow-toggle.js` | Per-turn reminder trigger dla trybu iteracyjnego. Istnienie pliku = ON. |
| `<stateDir>/.krux-konkret-active` | `krux-konkret-toggle.js` | `krux-konkret-toggle.js` | Per-turn reminder trigger dla trybu konkret. Istnienie pliku = ON. |
| `<stateDir>/.krux-turn-count` | `krux-toggle.js` (`hooks/lib/drift-guard.js`) | `krux-toggle.js` | Liczniki tur od ostatniego wzmocnienia persony — JSON map `{session_id: {n, t}}`, wpisy starsze niż 24h prunowane. Reset (tylko własny wpis sesji) przy SessionStart mode=on i przy jawnym `krux`/`stop krux`. |
| `<stateDir>/.krux-horda-nudge` | `krux-horda-trigger.js` (`hooks/lib/drift-guard.js`) | `krux-horda-trigger.js` | Throttle podpowiedzi delegacji — ten sam format JSON map per `session_id`; wpis = tury od ostatniego nudge. |
| `<stateDir>/.krux-drift-emit` | `krux-toggle.js`, `activate.js` (`hooks/lib/drift-guard.js`) | `krux-toggle.js`, `activate.js` | Licznik wyemitowanych kotwic per sesja (ten sam format JSON map) — rotuje dodatni mikro-przykład. Celowo NIE resetowany przy wzmocnieniu persony: rotacja idzie dalej przez całą sesję. |
| `~/.claude/.krux-statusline-asked` | `activate.js` | `activate.js` | Claude-only marker że prompt o statusline już wyleciał. |

**Asymetria:** `.krux-mode` jest trwałe (między sesjami), `.krux-active` to runtime-only flag. `/krux:krux` i `$krux:krux` zapisują tylko `.krux-active`, bez zmiany `.krux-mode`. `$krux:krux on|off` jawnie zmienia stan trwały.

## Dystrybucja — Claude Code i Codex CLI

Ten sam plugin obsługuje dwa hosty przez dwa manifesty obok siebie: `.claude-plugin/plugin.json` (Claude Code) i `.codex-plugin/plugin.json` (Codex). `hooks/`, `skills/` i źródłowe role w `agents/` są współdzielone — żadnej kopii persony ani instrukcji roli.

**Stan między hostami.** `hooks/lib/state-dir.js` eksportuje `stateDir()`: zwraca `process.env.PLUGIN_DATA` gdy ustawione (Codex ustawia ten host-neutralny, zapisywalny katalog per-plugin), inaczej `~/.claude/` (Claude Code, dzisiejsze zachowanie 1:1). `activate.js`, `krux-toggle.js`, `krux-flow-toggle.js`, `krux-konkret-toggle.js` czytają katalog stanu przez ten resolver zamiast twardo kodować `~/.claude/`. Statusline (Claude-Code-specific, brak odpowiednika w Codex) jest owinięty w `if (!process.env.PLUGIN_DATA)` w `activate.js` — pod Codexem sekcja w ogóle się nie wykonuje.

**Orki pod Codex.** Manifest pluginu nie instaluje custom agents. `agents/ork-*.md` zostaje jedynym źródłem prawdy: `skills/krux/orchestration-codex.md` każe głównemu agentowi przeczytać właściwą rolę i przekazać jej kluczowe instrukcje natywnemu subagentowi Codexa. `skills/krux/orchestration.md` jest routerem wspólnym, a `orchestration-claude.md` zachowuje `Agent` tool, nazwy `@krux:ork-*` i modele Claude.

## Skille — jak są ze sobą powiązane

- `krux` — persona. Lean `SKILL.md` (Persona + 4 PRAWA + pary „Ludzie vs Krux" + hierarchia KODEKSU + Granice + odsyłacze) wstrzykiwany przez `activate.js` przy `startup`. **4 PRAWA** = szkielet głosu, **pary** = kalibracja brzmienia, **KODEKS ROBOTY** mówi jak buduje. Szczegółowe CIĘCIA i kontrakt raportu są w `robota.md`. `orchestration.md` wybiera `orchestration-claude.md` albo `orchestration-codex.md`. Feature flag `KRUX_NATIVE_SKILL=1` (eksperymentalny) wyłącza wstrzyk body; zachowanie osłania `test/activate.test.js`.
- `krux-flow` — orthogonal. Ma własny hook toggle. Skill dokumentuje zasady, hook wymusza je per-turn.
- `krux-konkret` — orthogonal. Ma własny hook toggle. Tryb chirurgicznej
  precyzji zakresu: tylko A, najprostsze działające, obok = 1 linia raportu,
  delegacja dziedziczy kontrakt. Nie zmienia stanu persony ani flow.

## Konwencje — co robić, czego nie

**Co robić:**
- Nowe hooki → `hooks/*.js`, wszystkie Node.js, bez zewnętrznych zależności. Node.js jest jawnym wymaganiem obu hostów.
- Nowe skille → `skills/{name}/SKILL.md`. Claude używa `/krux:{name}`, Codex `$krux:{name}`. Nie dodawać `commands/` — legacy format, skill i tak wygrywa.
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

**Miks praw, przykładów i kotwicy — trzy warstwy persony.** SKILL.md daje 4 PRAWA oraz przykłady brzmienia, a hook mechanicznie wzmacnia aktywną personę. Runtime składa jeden dodatni kontrakt: tożsamość + dodatni przykład + kontrakt zadania. Własna walidacja brancha `persona-rewrite-fewshot` pokazała, że czysty few-shot może zwiększać gadatliwość i psuć granice. ContextEcho (arXiv:2605.24279) wykazał dryf zależny od modelu i w swoim układzie odzyskiwał personę oraz format przez świeżą, łączoną kotwicę tożsamości i demonstracji; nie dowodzi uniwersalnej przewagi reguł nad przykładami. Wytyczne Anthropic wspierają szczegółową rolę i przykłady. Dlatego Krux zachowuje miks, ale jego skuteczność musi mierzyć lokalnie benchmark, nie sama obecność tekstu w hooku.

**Drift-guard: mechaniczna dodatnia kotwica.** Wzmocnienie czysto zdarzeniowe (SessionStart, jawna fraza toggle) zostawiało między zdarzeniami ciszę, a `context-watch.md` zależał od samoobserwacji modelu. Teraz każda aktywna tura dostaje `KRUX TURN` z tożsamością, kontraktem zachowania treści i rotowanym dodatnim przykładem. `hooks/lib/drift-guard.js` równolegle liczy tury od ostatniego pełnego wzmocnienia; co `KRUX_DRIFT_INTERVAL` tur `krux-toggle.js` zastępuje lekką kotwicę pełnym `KRUX DRIFT-GUARD`, który dodaje esencję 4 PRAW. Runtime nie wywołuje dodatkowego modelu. `KRUX_TURN_REMINDER=0` przywraca ciszę tylko poniżej progu. Liczniki i rotacja są per-sesja, bo globalny licznik psuł kadencję przy równoległych sesjach.

**Nudge Hordy: delegacja nie zależy od pamięci modelu.** Ta sama filozofia co drift-guard — samoobserwacja zawodna, więc `krux-horda-trigger.js` mechanicznie łapie triggery ról w promptcie i podpowiada sprawdzenie bramki korzyści. Podpowiedź nie wymusza spawnu: decyzja zostaje przy modelu (bramka korzyści w `orchestration.md`). Osobny plik hooka zgodnie z konwencją „nie mieszać logiki"; generyczny magazyn liczników per-sesja współdzielony z drift-guardem przez `hooks/lib/drift-guard.js`.

**Statusline copy przy aktywacji.** Settings wskazują na stabilną ścieżkę `~/.claude/.krux-statusline.sh`, a skrypt jest kopiowany z wersjonowanego cache pluginu na SessionStart. Ponowne wywołanie w ciągu 5 sekund pomija zbędną kopię. Update pluginu → update statusline bez zmiany settings.json.

## Testy

Framework: `node:test` (wbudowany, zero zależności zgodnie z konwencją zero-install). Uruchomienie: `npm test`.

Testy deterministyczne potwierdzają skład promptu, transport hooka, stan i scorer;
nie potwierdzają, że konkretny model wykona personę. Opt-in benchmark uruchamia
świeże procesy hosta dla wariantów `control|identity|demo|combined`:

```bash
npm run eval:persona -- --host codex --reps 5 --variant all
npm run eval:persona -- --host claude --reps 5 --variant all
```

Komendy uruchamiaj z checkoutu repozytorium; `--model <id>` przypina model.
Raw jest zapisywany przed scoringiem, pochodny `scores.jsonl` rozdziela personę,
zadanie i koszt, a raport agreguje stabilność per scenariusz i sparowaną inflację
oraz zapisuje git SHA, model, CLI i wersję scorera. `--rescore <run-dir>` regeneruje
scores i raport bez model call. Syntetyczny
`context-summary-probe` nie jest natywnym compactem ani rozmową wieloturową.
Surowe odpowiedzi trzeba czytać przy każdym trafionym markerze. Brak CLI =
`SKIP`, nie zaliczony test; `npm test` nie wykonuje wywołań modelu.

Pokrycie:
- `krux-toggle.js` — regex (diacritics, ASCII, case, full-match, trim), stan pliku, malformed stdin, kompaktowy invariant na każdej aktywnej turze, pełny drift-guard zastępujący go co próg, `KRUX_TURN_REMINDER=0` wyłączający tylko invariant + reset na on/off (`test/krux-toggle.test.js`)
- `krux-flow-toggle.js` — toggle flag, emit JSON, per-turn reminder, aliasy (katalog `test`, plik `krux-flow-toggle.test.js`)
- `krux-konkret-toggle.js` — toggle flag, aliasy (`strict`), full-match only, per-turn reminder, malformed stdin, PLUGIN_DATA (`test/krux-konkret-toggle.test.js`)
- `krux-horda-trigger.js` — match triggerów (word-boundary, diacritics fold), throttle per-sesja, env off, niezależność od persony (`test/krux-horda-trigger.test.js`)
- `activate.js` — getDefaultMode resolution order (env > plik > default), startup/compact vs resume branch, SKILL.md frontmatter strip, statusline copy, setup prompts, reset licznika drift-guard własnej sesji na każdym mode=on źródle (`test/activate.test.js`)
- `hooks/lib/drift-guard.js` — skład lekkiej i pełnej dodatniej kotwicy, rotacja przykładów, opt-out `KRUX_TURN_REMINDER=0|off`, próg oraz liczniki per-sesja (`test/drift-guard.test.js`)
- `persona-eval` — judge-free scorer persony/zadania/kosztu i runner świeżych procesów Codex/Claude; modelowe wywołania tylko przez `npm run eval:persona` (`test/persona-eval.test.js`)
- `triggers-sync` — `agents/triggers.json` zsynchronizowany z `description` każdego orka (`test/triggers-sync.test.js`)
- `agents-shape` — walidacja frontmatter orków (name/description/model/color/tools, zakaz `<example>` i `user:`/`assistant:`, odsyłacz do `_common.md`, limit 50 linii body) (`test/agents-shape.test.js`)
- `integration` — testy integracyjne (opt-out persystencja, ortogonalność flow/persona, resume nie wstrzykuje SKILL.md, pełny cykl per-turn/full-guard włącznie z resetem przez compact i `KRUX_TURN_REMINDER=0`) (`test/integration.test.js`)
- `plugin-contract` — synchronizacja 4 manifestów, cytowane i żywe komendy hooków, ścieżka pluginu ze spacją, frontmatter skilli zgodny z katalogiem (`test/plugin-contract.test.js`)
- `persona-contract` — rdzeń persony mały z jawnymi warunkami doczytania, hierarchia/raport/granice/model A-B-C, delegacja nie ucina raport do summary, ork dostaje jawny stan persony (`test/persona-contract.test.js`)
- `state-dir` — resolver katalogu stanu (`PLUGIN_DATA` vs `~/.claude/`) (`test/state-dir.test.js`)
- `codex-plugin-contract` — `.codex-plugin/plugin.json` istnieje, wymagane pola, ścieżki żywe (`test/codex-plugin-contract.test.js`)
- `codex-cli-integration` — izolowana instalacja marketplace/pluginu i sprawdzenie skilli przez `codex debug prompt-input` (`test/codex-cli-integration.test.js`)

**Konwencja testowa:** spawn hook jako podprocess z izolowanym `HOME`, karm JSONem na stdin, asertuj plik stanu + exit code + stdout/stderr. Dla hooków czytających env: w `spawnSync` **strippuj ambient `KRUX_*` i `PLUGIN_DATA`** z `process.env`, chyba że test przekazuje daną zmienną jawnie — konfiguracja hosta lub shell użytkownika może inaczej zanieczyścić testy i współdzielić ich stan.

## Orki (subprocessy)

- Nazwa: **orki** — nie "agenci". Pasuje do persony.
- Armia 6 ról w `agents/ork-*.md`: tropiciel, kowal, sedzia, malarz, tester, burzyciel. **Mapowanie triggerów → `agents/triggers.json`**. Claude ładuje je jako nazwanych agentów; Codex dostaje ich instrukcje inline przez `orchestration-codex.md`.
- **Frontmatter orka — konwencja:** `description: >` (folded scalar) z listą triggerów po przecinku. **Nie używać** `<example>` / inline `user:`/`assistant:` w description — YAML parser Claude Code interpretuje je jako nested keys i cała description + pole `tools` nie łykają (efekt: auto-invocation po triggerach nie działa, ork wygląda jak generic „Agent from krux plugin" w system prompt).
- Orki zwracają standardowy JSON z kluczami `status` / `summary` / `details` / opcjonalnie `files` / `tests` / `verdict` — Krux parsuje `summary` dla usera, reszta dla niego.

## Wersjonowanie

`.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `package.json` i `.codex-plugin/plugin.json` muszą być zsynchronizowane. Plugin.json to źródło prawdy dla zainstalowanego pluginu Claude Code, marketplace.json dla listingu w `/plugin` UI (Claude Code czyta stąd wersję przy refresh marketplace), package.json dla npm-style metadanych, `.codex-plugin/plugin.json` dla instalacji przez Codex CLI. Bumpować wszystkie cztery razem ręcznie — test `plugin-contract.test.js` blokuje rozjazd wersji.

**Dwa testy mają dodatkowo zahardkodowaną dokładną wartość** (nie tylko spójność między plikami) — `plugin-contract.test.js` (`assert.equal(versions[0], ...)`) i `codex-cli-integration.test.js` (`assert.equal(installed.version, ...)`, uruchamia się tylko z zainstalowanym Codex CLI). Bump wersji bez aktualizacji tych dwóch asercji = czerwony `npm test`.

## Publikacja

Marketplace: `karolkiljan/krux` (patrz README). Nie publikujemy na npm (plugin nie jest npm package). Commity w stylu `feat: vX.Y.Z — opis` dla release'ów, zwykłe Conventional Commits dla reszty.
