<p align="center">
  <img src="https://em-content.zobj.net/source/apple/391/pick_26cf-fe0f.png" width="120" />
</p>

<h1 align="center">krux</h1>

<p align="center">
  <strong>Krux kopać ruda w Górnicza Dolina. Teraz Krux robić kod w Dolina Krzemowa.</strong>
</p>

<p align="center">
  <sub>Plugin pod Claude Code i Codex (persona ork-programisty). <strong>Nie powiązany</strong> z <a href="https://github.com/selfcustody/krux">selfcustody/krux</a> (Bitcoin signing device firmware).</sub>
</p>

---

Ork wiedzieć dużo. Ork gadać mało. Claude Code i Codex słuchać.

Mniej tokenów, pełna treść techniczna. Najmocniej czuć na bugfixach i setupie.

## Przed i po

<table>
<tr>
<td width="50%">

### Zwykły Claude

> "Oczywiście, chętnie pomogę! Problem wynika z przekazywania obiektu inline do komponentu opakowanego w React.memo. Przy każdym renderowaniu rodzica powstaje nowa referencja, więc płytkie porównanie propsów uznaje ją za zmianę i nie pomija renderu dziecka. Użyj useMemo ze stabilnymi zależnościami."

</td>
<td width="50%">

### Krux Claude

> "`React.memo` child dostaje inline object prop → nowa referencja obala shallow compare przy każdym renderze parenta. Memoizuj obiekt przez `useMemo` ze stabilnymi zależnościami."

</td>
</tr>
<tr>
<td>

### Zwykły Claude

> "Świetne pytanie! Middleware sprawdza wygaśnięcie JWT przez `exp < now`. Semantyka `exp` zabrania akceptacji tokenu od tej chwili, więc przy `exp === now` token też musi być wygasły. Zmień warunek na `exp <= now`."

</td>
<td>

### Krux Claude

> "JWT expiry: `exp < now` błędnie akceptuje token przy `exp === now`. `exp` obowiązuje do tej chwili, nie włącznie → użyj `exp <= now`."

</td>
</tr>
</table>

**Ten sam fakt. Mniej słów. Ork wiedzieć dużo - ork nie gadać dużo.**

## Dlaczego ork - nie tylko kompresja

Krux nie gadać więcej niż trzeba.

| Zwykły Claude | Krux Claude |
|---------------|-------------|
| `zrobiłem` | `zrobić` - bezokolicznik = wszystkie czasy |
| `przez middleware` | `middleware` - mianownik zawsze |
| `jest pusty` | `pusty` - brak „być" |
| `jeśli nie naprawisz, błąd` | `napraw, albo błąd` |
| `wiem, że jest błąd` | `wiem: błąd` - bez „że" |

**Górnicza Dolina** uczyć: każde słowo kosztować. Każdy cios musieć trafiać.  
**Dolina Krzemowa** uczyć: każdy token kosztować magiczna ruda. Krótszy output = mniej tokenów do wygenerowania.

## Orkowie — armia generala Krux

Krux teraz **general**. Dowodzi 6 rolami roboczymi, każda do konkretnej roboty. Nie musisz wybierać — piszesz po polsku, krux dobiera rolę na podstawie kontekstu, a hook `krux-horda-trigger` dodatkowo podpowiada delegację, gdy prompt pasuje do triggera (max 1 podpowiedź na 5 turnów; wyłączenie: `KRUX_HORDA_NUDGE=0`). Claude Code ładuje nazwanych agentów pluginu i pozwala wywołać `@krux:ork-nazwa`. Codex przekazuje te same instrukcje ról swoim natywnym subagentom; nie instaluje osobnych custom agents.

Każdy ork Hordy nosi w lore imię z fachu: **Niuch** (tropiciel), **Grom** (kowal), **Piryt** (sędzia), **Ochra** (malarz), **Młot** (tester), **Lont** (burzyciel).

### Kiedy który ork się odpala

| Ork | Rola | Frazy które go wzywają |
|-----|------|------------------------|
| `@krux:ork-burzyciel` | Refaktoring i usuwanie martwego kodu (dedup, podział plików, unused) | „usuń", „wywal", „zburz", „duplikacja", „podziel plik", „martwy kod" |
| `@krux:ork-kowal` | Backend (API, bazy danych, server) | „backend", „API", „endpoint", „baza danych", „SQL", „server", „model danych" |
| `@krux:ork-malarz` | UI/frontend | „UI", „frontend", „wygląd", „design", „CSS", „komponent" |
| `@krux:ork-sedzia` | Code review | „review", „przejrzyj", „audyt", „ocena kodu" |
| `@krux:ork-tester` | Testy/weryfikacja | „test", „testy", „npm test", „verify", „coverage", „unit test", „uruchom testy" |
| `@krux:ork-tropiciel` | Debugging i eksploracja kodu | „debug", „błąd", „stack trace", „napraw bug", „co pada", „crash", „znajdź", „gdzie jest", „szukaj", „explore" |

### Co zwraca ork

Każdy ork zwraca standardowy JSON z polami: `status` (ok/warning/error), `summary` (wynik w 1 zdaniu), `details`, opcjonalnie `files`, `tests`, `verdict`. Krux zaczyna od `summary`, a po nietrywialnej zmianie składa z reszty zwięzły raport: przepływ, powód, kluczowe pliki i wykonana weryfikacja.

### Wielu orków na raz

Krux sam ocenia sytuację i dobiera formację — nie musisz nic włączać:

- **Solo** — wąskie zadanie, jedna domena → jeden ork.
- **Łańcuch** — output A = input B (np. `zrozum → napraw → sprawdź`) → tropiciel → kowal → tester.
- **Równolegle** — 2+ niezależne zadania (różne pliki, bez wspólnego stanu) → wielu orków jednocześnie.

Decyzja z kontekstu wiadomości. Anty-formacje: ten sam plik dla dwóch orków (konflikt edycji), łańcuch bez zależności (zbędna sekwencja), ork do trywialnego zadania (marnotrawstwo).

## Skille

| Komenda | Co robi |
|---------|---------|
| *(domyślnie aktywny)* | Tryb krux - łamana gramatyka, maksymalna kompresja |
| `/krux:krux-flow [on\|off\|cel]` | Tryb iteracyjny — jeden ruch na raz, bez upfront planu. Włącz też przez `flow`, wyłącz `stop flow` |
| `/krux:krux-konkret [on\|off]` | Tryb chirurgicznej precyzji — dokładnie to o co prosisz, nic więcej. Włącz też przez `konkret` / `strict`, wyłącz `konkret off` |
| `$krux:krux [on\|off]` | Codex: załaduj personę jednorazowo albo zmień trwały stan |
| `$krux:krux-flow [on\|off\|cel]` | Codex: tryb iteracyjny — jeden ruch na raz |
| `$krux:krux-konkret [on\|off]` | Codex: tryb chirurgicznej precyzji — tylko to o co prosisz |

## Wymagania

- macOS lub Linux
- Claude Code albo Codex CLI / Codex app
- Node.js dostępny jako `node` w `PATH` — hooki są skryptami Node.js
- Brak zależności npm i brak kroku `npm install`

## Instalacja — Claude Code

```bash
claude plugin marketplace add karolkiljan/krux
claude plugin install krux@krux-marketplace
```

## Codex CLI

```bash
codex plugin marketplace add karolkiljan/krux
codex plugin add krux@krux-marketplace
```

Po instalacji:

1. Otwórz `/hooks`, przejrzyj i zaufaj wszystkim ośmiu definicjom komend z
   `hooks/codex/hooks.json`. Codex celowo nie uruchamia nowych ani zmienionych
   hooków bez jednorazowego zatwierdzenia.
2. Rozpocznij świeże zadanie — już otwarty wątek może trzymać poprzednią kopię
   pluginu i stary kontekst.
3. Sprawdź krótkim promptem, czy odpowiedź ma głos Kruxa. W transcripcie powinny
   pojawić się konteksty `KRUX PERSONA ACTIVE` i `KRUX TURN`; po dłuższej turze
   narzędziowej także `KRUX CONTINUATION`.

Adapter Codexa używa wyłącznie natywnych `PLUGIN_ROOT` (ścieżka instalacji) i
`PLUGIN_DATA` (stan pluginu). Nie wymaga globalnego ani projektowego
`AGENTS.md`. Taki plik jest tylko opcjonalnym fallbackiem, gdy polityka
organizacji całkowicie wyłącza hooki pluginów; nie jest częścią instalacji Kruxa.

Skille pojawiają się jako `$krux:krux` i `$krux:krux-flow`. Orki nie pojawiają
się jako osobne custom agents — skill przekazuje ich role natywnym subagentom
Codexa, gdy delegacja ma sens.

## Użycie

Po zaufaniu hookom persona aktywuje się przy starcie sesji. Statusline jest tylko dla Claude Code — tam plugin proponuje konfigurację `[KRUX]` przy pierwszym uruchomieniu; Codex pomija ten krok.

Codex wzmacnia personę na `SessionStart`, `UserPromptSubmit`, `PostToolUse` i
`SubagentStart`. Przed zakończeniem `Stop` przepuszcza głos Kruxa i formaty
ścisłe bez zmian, a neutralny finał może raz poprosić model o kompletną korektę.
`stop_hook_active` blokuje pętlę: druga wersja zawsze przechodzi.

**Trwałe przełączanie** (persystuje między sesjami):

| Fraza | Efekt |
|-------|-------|
| `krux` / `włącz krux` / `start krux` / `aktywuj krux` | Włącz |
| `stop krux` / `wyłącz krux` / `normalny tryb` | Wyłącz |

**Ważne:** fraza musi być **całą wiadomością** — bez dodatkowego tekstu. `krux` działa, `hej krux włącz się` nie. Polskie znaki opcjonalne (regex ogarnie obie wersje).

**Claude `/krux:krux` i Codex `$krux:krux`** — jednorazowe. Wciągają skill do bieżącej sesji, ale **nie zmieniają** `.krux-mode`. Codex obsługuje też `$krux:krux on` i `$krux:krux off` jako trwałe przełączniki.

**Stan hosta:**

- Claude Code: `~/.claude/.krux-*`.
- Codex: pliki `.krux-*` w zarządzanym katalogu `PLUGIN_DATA` danego pluginu.

Sprawdzenie stanu Claude Code:
```bash
cat ~/.claude/.krux-mode   # on albo off
```

Wyłączenie trwa aż do ręcznego włączenia - niezależnie od sesji.

## Konfiguracja

**Zmienne środowiskowe:**
```bash
export KRUX_DEFAULT_MODE=off            # wyłącz domyślnie
export KRUX_DRIFT_INTERVAL=10           # co ile turnów pełna kotwica persony
export KRUX_TURN_REMINDER=0             # wyłącz lekką kotwicę co turę; pełna zostaje
export KRUX_CODEX_TOOL_INTERVAL=4       # Codex: kotwica co ile wyników narzędzi
export KRUX_FINAL_GUARD=0                # Codex: wyłącz jednorazową korektę finału
export KRUX_HORDA_NUDGE=0               # wyłącz podpowiedzi delegacji do orków
export KRUX_HORDA_NUDGE_INTERVAL=5      # minimalny odstęp turnów między podpowiedziami
```

Gdy persona jest aktywna, każdy turn dostaje dodatnią kotwicę `KRUX TURN`:
tożsamość + mierzalny ślad głosu + dodatni przykład + kontrakt zadania. Co
`KRUX_DRIFT_INTERVAL` turnów
pełny `KRUX DRIFT-GUARD` dodaje 4 PRAWA i używa kolejnego przykładu. Hook nie
wykonuje dodatkowego wywołania modelu. `KRUX_TURN_REMINDER=0` wyłącza lekką
kotwicę co turn; pełna nadal działa w ustawionym interwale.

### Benchmark persony

Testy hooków sprawdzają transport instrukcji, nie posłuszeństwo modelu. Zachowanie
mierzy jawnie uruchamiany benchmark na świeżych sesjach i czterech wariantach:
`control`, `identity`, `demo`, `combined`.
Uruchom go z katalogu checkoutu repozytorium:

```bash
npm run eval:persona -- --host codex --model <model-id> --reps 5 --variant all
npm run eval:persona -- --host claude --model <model-id> --reps 5 --variant all
npm run eval:codex-native -- --model <model-id> --reps 5 --personality none
```

Wyniki trafiają do ignorowanego `benchmarks/persona-eval/<run>/`. Surowe
`raw.jsonl` powstaje przed scoringiem i nie zawiera wyliczonego `score`;
pochodny `scores.jsonl` rozdziela `score.persona`, `score.task` i `score.cost`, a
`report.json` agreguje stabilność per scenariusz, inflację względem kontroli oraz
wersję scorera, git SHA, model i wersję CLI. Automatyczne markery są diagnostyką — trafienia sprawdź w surowej
odpowiedzi. Scenariusz syntetyczny `context-summary-probe` bada odpowiedź po
podanym streszczeniu, ale nie udaje natywnego compactu ani rozmowy wieloturowej.
`--model <model-id>` jest wymagane, żeby raport nie ukrywał użytego modelu.
Brak CLI hosta daje `SKIP`, nie `PASS`. Plan wywołań: `--dry-run`. Ponowne
przeliczenie istniejącego raw bez wywołania modelu:

```bash
npm run eval:persona -- --rescore benchmarks/persona-eval/<run>
npm run eval:codex-native -- --rescore benchmarks/codex-native-eval/<run>
```

`eval:codex-native` jest testem integracyjnym właściwego pluginu. Tworzy osobne,
izolowane `CODEX_HOME` dla kontroli i Kruxa, kopiuje tylko `auth.json`, instaluje
plugin wyłącznie w wariancie `native`, a potem wykonuje po 12 tur przez realne
`codex exec` + `codex exec resume`. Zapisuje odpowiedzi przed scoringiem, dowody
z transcriptu, rzeczywiste aktywacje final guarda zapisane przez hook i
porównanie kosztu w
`benchmarks/codex-native-eval/<run>/`.

`report.json` ustawia `accepted=true` dopiero po przejściu całej bramki:

- Persona native: minimum 80% zwykłych odpowiedzi i wynik wyższy od kontroli.
- Task native: 100% zachowanych warunków oraz formatów ścisłych.
- Każda natywna tura zakotwiczona przez lifecycle pluginu.
- Kontrola bez żadnego kontekstu `KRUX`; co najmniej jeden dowód
  `KRUX CONTINUATION` na powtórzenie.
- Brak dodatniej inflacji liczby słów względem sparowanej kontroli.

Kryteria są zapisane także maszynowo w `acceptanceCriteria`. Liczba aktywacji
final guarda jest diagnostyką, nie warunkiem — poprawna odpowiedź może od razu
mieć głos Kruxa.

`KRUX_DEFAULT_MODE` działa jako stan początkowy. Po użyciu `krux` albo `stop krux`
jawny wybór w `<stateDir>/.krux-mode` ma pierwszeństwo przed zmienną środowiskową.

**Plik stanu** (`<stateDir>/.krux-mode`) - automatycznie zarządzany przez hook:
```
off
```

## Odinstalowanie — Claude Code

`claude plugin uninstall krux` usuwa plugin, ale plugin zostawia w `~/.claude/` kilka plików stanu. Do wyczyszczenia ręcznie:

```bash
rm -f ~/.claude/.krux-active ~/.claude/.krux-mode \
      ~/.claude/.krux-active-sessions ~/.claude/.krux-drift-emit \
      ~/.claude/.krux-flow-active \
      ~/.claude/.krux-konkret-active \
      ~/.claude/.krux-turn-count ~/.claude/.krux-horda-nudge \
      ~/.claude/.krux-statusline-asked \
      ~/.claude/.krux-statusline.sh
```

Jeśli zarejestrowany był statusline `[KRUX]`, usuń pole `statusLine` z `~/.claude/settings.json`.

Projektowe `.claude/settings.local.json` może trzymać wpis `enabledPlugins["krux@krux-marketplace"]` — usuń klucz ręcznie, jeśli chcesz wyczyścić do zera.

## Odinstalowanie — Codex

```bash
codex plugin remove krux@krux-marketplace
```

Codex może pozostawić pliki `.krux-*` w katalogu `PLUGIN_DATA`. Nie usuwaj
ręcznie całego `PLUGIN_DATA`, jeśli współdzieli go przyszła wersja pluginu;
usuń tylko pliki z prefiksem `.krux-`, gdy potrzebny jest pełny reset.

## Granice

- **Kod / commity / PR:** pisz normalnie - krux nie modyfikuje kodu
- **Ostrzeżenia bezpieczeństwa:** pełna klarowność zawsze
- **Nieodwracalne operacje:** pełne potwierdzenie, bez skrótów
- **`stop krux`:** natychmiastowe wyłączenie

## Inspiracja

Polska adaptacja [caveman](https://github.com/JuliusBrussee/caveman) - JuliusBrussee.

## Licencja

MIT

---

Jak podoba - token kosztować dużo ruda. Jak chcieć [da rude](https://www.youtube.com/watch?v=y6120QOlsfU) - [móc](https://cuplink.to/bibsonello).

<p align="center">
  <a href="https://cuplink.to/bibsonello">
    <img src="https://img.shields.io/badge/☕_KUP_KAWĘ-token%20kosztuje%20ruda-FF6B35?style=for-the-badge&logo=buy-me-a-coffee&logoColor=white" alt="Kup kawę"/>
  </a>
</p>

*Górnicza Dolina dawać siłę. Dolina Krzemowa dawać zastosowanie. Krux dawać obom.*
