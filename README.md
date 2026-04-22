<p align="center">
  <img src="https://em-content.zobj.net/source/apple/391/pick_26cf-fe0f.png" width="120" />
</p>

<h1 align="center">krux</h1>

<p align="center">
  <strong>Krux kopać ruda w Górnicza Dolina. Teraz Krux robić kod w Dolina Krzemowa.</strong>
</p>

---

Ork wiedzieć dużo. Ork gadać mało. Claude Code słuchać.

Redukcja tokenów ~55% avg (12 promptów, haiku). Najlepiej na bugfixach i setupie.

## Przed i po

<table>
<tr>
<td width="50%">

### Zwykły Claude (81 tokenów)

> "Oczywiście, chętnie pomogę! Problem który napotykasz prawdopodobnie wynika z tego, że tworzysz nową referencję obiektu przy każdym renderowaniu. Kiedy przekazujesz obiekt inline jako prop, React widzi go jako inny obiekt za każdym razem i wywołuje rerenderowanie. Powinieneś użyć useMemo do memoizacji obiektu."

</td>
<td width="50%">

### Krux Claude (18 tokenów)

> "Nowa referencja każdy render. Inline prop → nowy obiekt → rerender. `useMemo`. Zrobione."

</td>
</tr>
<tr>
<td>

### Zwykły Claude

> "Świetne pytanie! Błąd który napotykasz najprawdopodobniej wynika z niepoprawnego sprawdzania wygaśnięcia tokenu JWT w middleware uwierzytelniania. Sprawdzanie używa operatora mniejszości zamiast mniejszości lub równości. Pozwól że zaproponuję poprawkę tego problemu."

</td>
<td>

### Krux Claude

> "Auth middleware padać. Token expiry: `<` zamiast `<=`. Fix linia 14."

</td>
</tr>
</table>

**Ten sam fakt. Mniej słów. Ork wiedzieć dużo - ork nie gadać dużo.**

```
┌─────────────────────────────────────────────────┐
│  bugfix / setup      ████████████████ 72–76%    │
│  code-review         █████████████░░░ 65%       │
│  debugging           ████████████░░░░ 37–59%    │
│  architecture        ██████████░░░░░░ 53%       │
│  devops / refactor   █████████░░░░░░░ 42–49%    │
│  explanation         ████████░░░░░░░░ 44%       │
│  RAZEM               ███████████░░░░░ 55%       │
│                                                 │
│  TREŚĆ TECHNICZNA    ████████████████ 100%      │
└─────────────────────────────────────────────────┘
```

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
**Dolina Krzemowa** uczyć: każdy token kosztować magiczna ruda. Model szybszy - myśleć mniej.

## Skille

| Komenda | Co robi |
|---------|---------|
| *(domyślnie aktywny)* | Tryb krux - łamana gramatyka, maksymalna kompresja |
| `/krux-commit` | Commit message - Conventional Commits, ≤50 znaków |
| `/krux-review` | Code review - `L42: 🔴 bug: opis. fix.` |
| `/krux-compress <plik>` | Przepisz markdown w stylu krux, ~40% mniej tokenów |
| `/krux-context-threshold <N>` | Ustaw próg tokenów dla context watch (domyślnie 85000) |
| `/krux-flow [on\|off\|cel]` | Tryb iteracyjny — jeden ruch na raz, bez upfront planu. Włącz też przez `flow`, wyłącz `stop flow` |
| `/krux-help` | Karta referencyjna - wszystkie prawa i słownik |

## Wymagania

- Claude Code (dostarcza Node.js — plugin nie wymaga dodatkowych zależności)

## Instalacja

```bash
claude plugin marketplace add karolkiljan/krux
claude plugin install krux@krux-marketplace
```

## Użycie

Aktywuje się sam przy starcie sesji. Plugin sam proponuje konfigurację statusline `[KRUX]` przy pierwszym uruchomieniu.

**Trwałe przełączanie** (persystuje między sesjami — zapisuje stan do `~/.claude/.krux-mode`):

| Fraza | Efekt |
|-------|-------|
| `krux` / `włącz krux` / `start krux` / `aktywuj krux` | Włącz |
| `stop krux` / `wyłącz krux` / `normalny tryb` | Wyłącz |

**Ważne:** fraza musi być **całą wiadomością** — bez dodatkowego tekstu. `krux` działa, `hej krux włącz się` nie. Polskie znaki opcjonalne (regex ogarnie obie wersje).

**Slash command `/krux:krux`** — jednorazowy. Wciąga skill do bieżącej sesji, ale **nie zmienia** `.krux-mode`. Następna sesja wróci do zapisanego stanu.

**Sprawdzenie stanu:**
```bash
cat ~/.claude/.krux-mode   # on albo off
```

Wyłączenie trwa aż do ręcznego włączenia - niezależnie od sesji.

## Konfiguracja

**Zmienne środowiskowe:**
```bash
export KRUX_DEFAULT_MODE=off            # wyłącz domyślnie
export KRUX_CONTEXT_THRESHOLD=85000     # próg ostrzeżenia context watch (tokeny)
export KRUX_CONTEXT_COOLDOWN=300        # minimalny odstęp między ostrzeżeniami (sekundy)
export KRUX_CONTEXT_WATCH=off           # wyłącz context watch (persona krux zostaje)
```

**Plik stanu** (`~/.claude/.krux-mode`) - automatycznie zarządzany przez hook:
```
off
```

## Odinstalowanie

`claude plugin uninstall krux` usuwa plugin, ale plugin zostawia w `~/.claude/` kilka plików stanu. Do wyczyszczenia ręcznie:

```bash
rm -f ~/.claude/.krux-active ~/.claude/.krux-mode \
      ~/.claude/.krux-statusline-asked \
      ~/.claude/.krux-statusline.sh ~/.claude/.krux-statusline.ps1
```

Jeśli zarejestrowany był statusline `[KRUX]`, usuń pole `statusLine` z `~/.claude/settings.json`.

Projektowe `.claude/settings.local.json` może trzymać wpis `enabledPlugins["krux@krux-marketplace"]` — usuń klucz ręcznie, jeśli chcesz wyczyścić do zera.

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
