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

## Adaptery hosta — osobny transport, wspólny rdzeń

Dwa osobne adaptery hosta chronią kompatybilność zamiast udawać wspólny runtime.

| Host | Rejestr hooków | Transport persony | Zmienne hosta |
|------|----------------|-------------------|---------------|
| Claude Code | `hooks/hooks.json` | `hooks/activate.js`, `hooks/krux-toggle.js` | `CLAUDE_PLUGIN_ROOT`, fallback stanu `~/.claude/` |
| Codex | `hooks/codex/hooks.json`, wskazany jawnie przez `.codex-plugin/plugin.json` | `hooks/codex/persona-context.js`, `hooks/codex/persona-stop.js` | `PLUGIN_ROOT`, `PLUGIN_DATA` |

Nie traktuj jednego manifestu hooków jako źródła prawdy dla obu hostów. Claude
i Codex mają różne lifecycle, zmienne i kontrakty outputu. Wspólne źródło prawdy
to czysta logika w `hooks/lib/persona-mode.js`, `hooks/lib/drift-guard.js` oraz
`hooks/lib/persona-voice.js`; transport pozostaje osobny.

### Lifecycle Claude Code

| Hook | Plik | Rola |
|------|------|------|
| `SessionStart` | `hooks/activate.js` | Startup/compact wstrzykuje skill; resume zwartą kotwicę; obsługuje Claude-only statusline. |
| `UserPromptSubmit` | `hooks/krux-toggle.js` | Toggle persony i per-turn drift guard. |
| `UserPromptSubmit` | `hooks/krux-flow-toggle.js` | Niezależny toggle flow. |
| `UserPromptSubmit` | `hooks/krux-konkret-toggle.js` | Niezależny toggle konkret. |
| `UserPromptSubmit` | `hooks/krux-horda-trigger.js` | Nudge delegacji według `agents/triggers.json`. |

### Lifecycle Codexa

| Hook | Plik | Rola |
|------|------|------|
| `SessionStart` | `hooks/codex/persona-context.js` | Startup/clear/compact wstrzykuje pełny skill; resume zwartą pełną kotwicę; aktywność per sesja. |
| `UserPromptSubmit` | `hooks/codex/persona-context.js` + trzy istniejące hooki osi | Toggle, kotwica turnu i flaga formatu ścisłego; flow, Horda i konkret zachowują osobny stan. |
| `PostToolUse` | `hooks/codex/persona-context.js` | Automatyczna tura bez promptu dostaje kotwicę po pierwszym toolu; regularna co `KRUX_CODEX_TOOL_INTERVAL` (domyślnie 4). |
| `SubagentStart` | `hooks/codex/persona-context.js` | Aktywna sesja rodzica przekazuje zwartą kotwicę subagentowi. |
| `Stop` | `hooks/codex/persona-stop.js` | Neutralny finał blokuje najwyżej raz; JSON, code-only, Conventional Commit, format ścisły i `stop_hook_active=true` przechodzą. |

Codexowy adapter nie czyta `CLAUDE_PLUGIN_*` ani `~/.claude/`. Brak lub zły
`PLUGIN_DATA` kończy się cichym sukcesem. Wszystkie context eventy zwracają
`hookSpecificOutput.hookEventName` zgodny z faktycznym eventem; `Stop` zwraca
wyłącznie natywne `decision` i `reason`.

## Stan — gdzie co żyje

| Plik | Kto pisze | Kto czyta | Cel |
|------|-----------|-----------|-----|
| `<stateDir>/.krux-mode` | adapter persony hosta | adapter persony hosta | Trwały opt-in/out persony między sesjami (`on`/`off`). Jawny wybór z pliku ma pierwszeństwo przed `KRUX_DEFAULT_MODE`, które ustawia tylko stan początkowy. |
| `<stateDir>/.krux-active` | `krux-toggle.js`, `activate.js` | statusline script tylko pod Claude | Globalny runtime flag — od v2.10.0 czyta go WYŁĄCZNIE statusline (bash bez session_id, ostatnia akcja wygrywa). Gate reminderów siedzi w `.krux-active-sessions`. |
| `<stateDir>/.krux-active-sessions` | adaptery persony przez `hooks/lib/drift-guard.js` | adaptery persony | Per-sesyjny gate reminderów i Codex final guarda (JSON map per `session_id`, TTL 24h odświeżany na SessionStart). |
| `<stateDir>/.krux-flow-active` | `krux-flow-toggle.js` | `krux-flow-toggle.js` | Per-turn reminder trigger dla trybu iteracyjnego. Istnienie pliku = ON. |
| `<stateDir>/.krux-konkret-active` | `krux-konkret-toggle.js` | `krux-konkret-toggle.js` | Per-turn reminder trigger dla trybu konkret. Istnienie pliku = ON. |
| `<stateDir>/.krux-turn-count` | `krux-toggle.js` (`hooks/lib/drift-guard.js`) | `krux-toggle.js` | Liczniki tur od ostatniego wzmocnienia persony — JSON map `{session_id: {n, t}}`, wpisy starsze niż 24h prunowane. Reset (tylko własny wpis sesji) przy SessionStart mode=on i przy jawnym `krux`/`stop krux`. |
| `<stateDir>/.krux-horda-nudge` | `krux-horda-trigger.js` (`hooks/lib/drift-guard.js`) | `krux-horda-trigger.js` | Throttle podpowiedzi delegacji — ten sam format JSON map per `session_id`; wpis = tury od ostatniego nudge. |
| `<stateDir>/.krux-drift-emit` | `krux-toggle.js`, `activate.js` (`hooks/lib/drift-guard.js`) | `krux-toggle.js`, `activate.js` | Licznik wyemitowanych kotwic per sesja (ten sam format JSON map) — rotuje dodatni mikro-przykład. Celowo NIE resetowany przy wzmocnieniu persony: rotacja idzie dalej przez całą sesję. |
| `<stateDir>/.krux-codex-turn-context` | `persona-context.js` | `persona-context.js`, `persona-stop.js` | Codex-only: `turn_id`, format ścisły, liczba tooli i informacja, czy tura dostała kotwicę. |
| `~/.claude/.krux-statusline-asked` | `activate.js` | `activate.js` | Claude-only marker że prompt o statusline już wyleciał. |

**Asymetria:** `.krux-mode` jest trwałe (między sesjami), `.krux-active` to runtime-only flag. `/krux:krux` i `$krux:krux` zapisują tylko `.krux-active`, bez zmiany `.krux-mode`. `$krux:krux on|off` jawnie zmienia stan trwały.

## Dystrybucja — Claude Code i Codex CLI

Ten sam plugin obsługuje dwa hosty przez dwa manifesty obok siebie: `.claude-plugin/plugin.json` (Claude Code) i `.codex-plugin/plugin.json` (Codex). `skills/`, czyste biblioteki `hooks/lib/` i źródłowe role w `agents/` są współdzielone. Entrypointy i rejestry hooków są osobne.

**Stan między hostami.** Natywny adapter persony Codexa wymaga wprost `PLUGIN_DATA`; brak kończy go cicho. Współdzielone hooki flow/Hordy/konkret używają `hooks/lib/state-dir.js`, który pod Codexem wybiera `PLUGIN_DATA`, a pod Claude `~/.claude/`. `activate.js` pozostaje entrypointem Claude; jego statusline jest Claude-only.

**Orki pod Codex.** Manifest pluginu nie instaluje custom agents. `agents/ork-*.md` zostaje jedynym źródłem prawdy: `skills/krux/orchestration-codex.md` każe głównemu agentowi przeczytać właściwą rolę i przekazać jej kluczowe instrukcje natywnemu subagentowi Codexa. `skills/krux/orchestration.md` jest routerem wspólnym, a `orchestration-claude.md` zachowuje `Agent` tool, nazwy `@krux:ork-*` i modele Claude.

## Skille — jak są ze sobą powiązane

- `krux` — persona. Lean `SKILL.md` (Persona + 4 PRAWA + pary „Ludzie vs Krux" + hierarchia KODEKSU + Granice + odsyłacze) wstrzykuje `activate.js` pod Claude oraz `persona-context.js` pod Codex. **4 PRAWA** = szkielet głosu, **pary** = kalibracja brzmienia, **KODEKS ROBOTY** mówi jak buduje. Szczegółowe CIĘCIA i kontrakt raportu są w `robota.md`. `orchestration.md` wybiera `orchestration-claude.md` albo `orchestration-codex.md`. Feature flag `KRUX_NATIVE_SKILL=1` jest kompatybilnością starego adaptera `activate.js`, nie steruje natywnym lifecycle Codexa.
- `krux-flow` — orthogonal. Ma własny hook toggle. Skill dokumentuje zasady, hook wymusza je per-turn.
- `krux-konkret` — orthogonal. Ma własny hook toggle. Tryb chirurgicznej
  precyzji zakresu: tylko A, najprostsze działające, obok = 1 linia raportu,
  delegacja dziedziczy kontrakt. Nie zmienia stanu persony ani flow.

## Konwencje — co robić, czego nie

**Co robić:**
- Nowe hooki → właściwy adapter hosta (`hooks/*.js` dla Claude, `hooks/codex/*.js` dla Codexa), wszystkie Node.js, bez zewnętrznych zależności.
- Nowe skille → `skills/{name}/SKILL.md`. Claude używa `/krux:{name}`, Codex `$krux:{name}`. Nie dodawać `commands/` — legacy format, skill i tak wygrywa.
- Diacritics w regex → zawsze tolerować warianty: `[łl]`, `[ąa]` albo `(ł|l)`, `(ą|a)`. Nigdy `[ł|l]` — taki zbiór dopuszcza znak `|`. Wzorce są w `krux-toggle.js` i `krux-flow-toggle.js`.
- Stan w `~/.claude/` → ukryte pliki prefiksowane `.krux-`.
- Triggery orków → `agents/triggers.json` (single source of truth). Każde słowo z listy MUSI być w `description` agenta — test `triggers-sync.test.js` to wymusza. Tabela w README jest tylko dokumentacyjną kopią dla użytkownika.

**Czego nie robić:**
- Nie mieszać logiki persony i flow w jednym hooku.
- Nie nadpisywać `.krux-mode` bez wyraźnej intencji usera (slash command vs trigger phrase).
- Nie dodawać zależności npm — plugin ma być zero-install.
- Nie zakładać że `SessionStart.source` to zawsze `startup`. Rozróżniaj `startup|resume|clear|compact` w obu adapterach.

## Decyzje projektowe — dlaczego tak

**Resume → zwarta pełna kotwica, compact → pełny reinject SKILL.md.** Resume zachowuje rozmowę, lecz nie wolno zakładać trwałości pozycji developer context; oba adaptery przypominają cały kontrakt w zwartej formie. Compact przepisuje kontekst, więc oba ponownie wstrzykują pełne `SKILL.md`.

**Miks praw, przykładów i kotwicy — trzy warstwy persony.** SKILL.md daje 4 PRAWA oraz przykłady brzmienia, a hook mechanicznie wzmacnia aktywną personę. Runtime składa jeden dodatni kontrakt: tożsamość + mierzalny kontrakt głosu + dodatni przykład + kontrakt zadania. Własna walidacja brancha `persona-rewrite-fewshot` pokazała, że czysty few-shot może zwiększać gadatliwość i psuć granice. ContextEcho (arXiv:2605.24279) wykazał dryf zależny od modelu i w swoim układzie odzyskiwał personę oraz format przez świeżą, łączoną kotwicę tożsamości i demonstracji; nie dowodzi uniwersalnej przewagi reguł nad przykładami. Wytyczne Anthropic wspierają szczegółową rolę i przykłady. Dlatego Krux zachowuje miks, ale jego skuteczność musi mierzyć lokalnie benchmark, nie sama obecność tekstu w hooku.

**Drift-guard: mechaniczna dodatnia kotwica.** Każda aktywna tura dostaje `KRUX TURN` z tożsamością, kontraktem zachowania treści, mierzalnym śladem głosu i rotowanym dodatnim przykładem. Co `KRUX_DRIFT_INTERVAL` tur wchodzi pełny `KRUX DRIFT-GUARD`. Codex dodatkowo domyka dziurę automatycznych kontynuacji przez `PostToolUse`: pierwszy tool niezakotwiczonej tury oraz co czwarty tool długiej tury emituje `KRUX CONTINUATION`. Same kotwice nie wołają modelu; tylko `Stop` może raz uruchomić korektę neutralnego finału. `persona-voice.js` jest wspólnym źródłem prawdy dla guarda i scorera: przepuszcza łamaną gramatykę albo orkowy słownik połączony z kompresją, a odrzuca pierwszą osobę i ofertę dalszej pracy. Liczniki i rotacja są per sesja.

**Nudge Hordy: delegacja nie zależy od pamięci modelu.** Ta sama filozofia co drift-guard — samoobserwacja zawodna, więc `krux-horda-trigger.js` mechanicznie łapie triggery ról w promptcie i podpowiada sprawdzenie bramki korzyści. Podpowiedź nie wymusza spawnu: decyzja zostaje przy modelu (bramka korzyści w `orchestration.md`). Osobny plik hooka zgodnie z konwencją „nie mieszać logiki"; generyczny magazyn liczników per-sesja współdzielony z drift-guardem przez `hooks/lib/drift-guard.js`.

**Statusline copy przy aktywacji.** Settings wskazują na stabilną ścieżkę `~/.claude/.krux-statusline.sh`, a skrypt jest kopiowany z wersjonowanego cache pluginu na SessionStart. Ponowne wywołanie w ciągu 5 sekund pomija zbędną kopię. Update pluginu → update statusline bez zmiany settings.json.

## Testy

Framework: `node:test` (wbudowany, zero zależności zgodnie z konwencją zero-install). Uruchomienie: `npm test`.

Testy deterministyczne potwierdzają skład promptu, transport hooka, stan i scorer;
nie potwierdzają, że konkretny model wykona personę. Opt-in benchmark uruchamia
świeże procesy hosta dla wariantów `control|identity|demo|combined`:

```bash
npm run eval:persona -- --host codex --model <model-id> --reps 5 --variant all
npm run eval:persona -- --host claude --model <model-id> --reps 5 --variant all
npm run eval:codex-native -- --model <model-id> --reps 5 --personality none
```

Komendy uruchamiaj z checkoutu repozytorium; wymagane `--model <id>` przypina model.
Raw jest zapisywany przed scoringiem, pochodny `scores.jsonl` rozdziela personę,
zadanie i koszt, a raport agreguje stabilność per scenariusz i sparowaną inflację
oraz zapisuje git SHA, model, CLI i wersję scorera. `--rescore <run-dir>` regeneruje
scores i raport bez model call. Syntetyczny
`context-summary-probe` nie jest natywnym compactem ani rozmową wieloturową.
Surowe odpowiedzi trzeba czytać przy każdym trafionym markerze. Brak CLI =
`SKIP`, nie zaliczony test; `npm test` nie wykonuje wywołań modelu.

Natywny runner ma twardą bramkę `accepted`: task 100%, persona minimum 80% i
wyżej od kontroli, brak dodatniej inflacji słów, każda tura zakotwiczona,
kontrola bez kontekstu Kruxa oraz co najmniej jeden `KRUX CONTINUATION` na
powtórzenie. Dokładny kontrakt trafia do `report.json.acceptanceCriteria`.

Pokrycie:
- `krux-toggle.js` — regex (diacritics, ASCII, case, full-match, trim), stan pliku, malformed stdin, kompaktowy invariant na każdej aktywnej turze, pełny drift-guard zastępujący go co próg, `KRUX_TURN_REMINDER=0` wyłączający tylko invariant + reset na on/off (`test/krux-toggle.test.js`)
- `krux-flow-toggle.js` — toggle flag, emit JSON, per-turn reminder, aliasy (katalog `test`, plik `krux-flow-toggle.test.js`)
- `krux-konkret-toggle.js` — toggle flag, aliasy (`strict`), full-match only, per-turn reminder, malformed stdin, PLUGIN_DATA (`test/krux-konkret-toggle.test.js`)
- `krux-horda-trigger.js` — match triggerów (word-boundary, diacritics fold), throttle per-sesja, env off, niezależność od persony (`test/krux-horda-trigger.test.js`)
- `activate.js` — getDefaultMode resolution order (env > plik > default), startup/compact vs resume branch, SKILL.md frontmatter strip, statusline copy, setup prompts, reset licznika drift-guard własnej sesji na każdym mode=on źródle (`test/activate.test.js`)
- `hooks/lib/drift-guard.js` — skład lekkiej i pełnej dodatniej kotwicy, rotacja przykładów, opt-out `KRUX_TURN_REMINDER=0|off`, próg oraz liczniki per-sesja (`test/drift-guard.test.js`)
- `persona-eval` — judge-free scorer persony/zadania/kosztu i runner świeżych procesów Codex/Claude; modelowe wywołania tylko przez `npm run eval:persona` (`test/persona-eval.test.js`)
- `codex-native-eval` — izolowane `CODEX_HOME`, realne `exec/resume`, wariant control/native, dowody transcriptu, `PostToolUse` i final guard (`test/codex-native-eval.test.js`)
- `codex-persona-context` / `codex-persona-stop` — natywny lifecycle, event-specific envelope, tool cadence, format ścisły i jednorazowa korekta (`test/codex-persona-context.test.js`, `test/codex-persona-stop.test.js`)
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
