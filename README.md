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

Po instalacji rozpocznij nowy wątek. Otwórz `/hooks`, przejrzyj cztery komendy z
`hooks/hooks.json` i zaufaj im. Codex celowo nie uruchamia nowych ani zmienionych
hooków pluginu bez jednorazowego zatwierdzenia.

Skille pojawiają się jako `$krux:krux` i `$krux:krux-flow`. Orki nie pojawiają
się jako osobne custom agents — skill przekazuje ich role natywnym subagentom
Codexa, gdy delegacja ma sens.

## Użycie

Po zaufaniu hookom persona aktywuje się przy starcie sesji. Statusline jest tylko dla Claude Code — tam plugin proponuje konfigurację `[KRUX]` przy pierwszym uruchomieniu; Codex pomija ten krok.

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
export KRUX_DRIFT_INTERVAL=10           # co ile turnów przypomnienie stylu (drift-guard)
export KRUX_TURN_REMINDER=0             # wyłącz krótki reminder co turę; pełny drift-guard zostaje
export KRUX_HORDA_NUDGE=0               # wyłącz podpowiedzi delegacji do orków
export KRUX_HORDA_NUDGE_INTERVAL=5      # minimalny odstęp turnów między podpowiedziami
```

Gdy persona jest aktywna, każdy turn dostaje krótki invariant `KRUX TURN`.
Co `KRUX_DRIFT_INTERVAL` turnów pełny, rotowany `KRUX DRIFT-GUARD` zastępuje
krótkie przypomnienie. `KRUX_TURN_REMINDER=0` wyłącza tylko invariant co turn;
pełny drift-guard nadal działa w ustawionym interwale.

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
