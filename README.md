<p align="center">
  <img src="https://em-content.zobj.net/source/apple/391/pick_26cf-fe0f.png" width="120" />
</p>

<h1 align="center">snaf</h1>

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

### Snaf Claude (18 tokenów)

> "Nowa referencja każdy render. Inline prop → nowy obiekt → rerender. `useMemo`. Zrobione."

</td>
</tr>
<tr>
<td>

### Zwykły Claude

> "Świetne pytanie! Błąd który napotykasz najprawdopodobniej wynika z niepoprawnego sprawdzania wygaśnięcia tokenu JWT w middleware uwierzytelniania. Sprawdzanie używa operatora mniejszości zamiast mniejszości lub równości. Pozwól że zaproponuję poprawkę tego problemu."

</td>
<td>

### Snaf Claude

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

| Zwykły Claude | Snaf Claude |
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
| *(domyślnie aktywny)* | Tryb snaf - łamana gramatyka, maksymalna kompresja |
| `/snaf-commit` | Commit message - Conventional Commits, ≤50 znaków |
| `/snaf-review` | Code review - `L42: 🔴 bug: opis. fix.` |
| `/snaf-compress <plik>` | Przepisz markdown w stylu snaf, ~40% mniej tokenów |
| `/snaf-context-threshold <N>` | Ustaw próg tokenów dla context watch (domyślnie 67000) |
| `/snaf-help` | Karta referencyjna - wszystkie prawa i słownik |

## Wymagania

- Python 3 (`python3` w PATH) — wymagany przez hooki context watch

## Instalacja

```bash
claude plugin marketplace add karolkiljan/snaf
claude plugin install snaf@snaf-marketplace
```

## Użycie

Aktywuje się sam przy starcie sesji. Plugin sam proponuje konfigurację statusline `[SNAF]` przy pierwszym uruchomieniu.

| Komenda | Efekt |
|---------|-------|
| `stop snaf` | Wyłącz - persystuje między sesjami |
| `normalny tryb` | Wyłącz - persystuje między sesjami |
| `snaf` | Włącz ponownie |

Wyłączenie trwa aż do ręcznego włączenia - niezależnie od sesji.

## Konfiguracja

**Zmienne środowiskowe:**
```bash
export SNAF_DEFAULT_MODE=off            # wyłącz domyślnie
export SNAF_CONTEXT_THRESHOLD=67000     # próg ostrzeżenia context watch (tokeny)
export SNAF_CONTEXT_COOLDOWN=300        # minimalny odstęp między ostrzeżeniami (sekundy)
```

**Plik stanu** (`~/.claude/.snaf-mode`) - automatycznie zarządzany przez hook:
```
off
```

## Granice

- **Kod / commity / PR:** pisz normalnie - snaf nie modyfikuje kodu
- **Ostrzeżenia bezpieczeństwa:** pełna klarowność zawsze
- **Nieodwracalne operacje:** pełne potwierdzenie, bez skrótów
- **`stop snaf`:** natychmiastowe wyłączenie

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
