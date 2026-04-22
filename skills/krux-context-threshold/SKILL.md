---
name: krux-context-threshold
description: >
  Ustawia próg tokenów dla context watch. Użyj gdy chcesz zmienić próg ostrzeżenia
  o dużym kontekście, wywołujesz /krux-context-threshold lub podajesz liczbę tokenów.
  Przykład: /krux-context-threshold 40000
argument-hint: Token count (integer, e.g. 40000) — "off" disables, "on" re-enables
disable-model-invocation: true
---

## Wykonanie

Argument: `$ARGUMENTS`.

Docelowy plik: `~/.claude/.krux-context-threshold` (nowa wartość trafia tu, nie do env w settings.json — env nie dociera do child procesów hooków).

### Przypadek 1 — argument to liczba całkowita > 0

Zapisz wartość do `~/.claude/.krux-context-threshold` (plik tekstowy, jedna liczba).

Tool: `Write` z zawartością tej liczby (bez nowej linii dodatkowej, bez whitespace).

Potwierdź:
```
Próg ustawiony: {wartość} tokenów. Plik: ~/.claude/.krux-context-threshold.
Działać natychmiast — Claude Code restart niepotrzebny.
```

### Przypadek 2 — argument to `off`

Całkowite wyłączenie context_watch (persona krux dalej działać).

Tool: `Write` pustego pliku do `~/.claude/.krux-context-watch-off` — hook czyta istnienie pliku, treść obojętna.

Potwierdź:
```
Context watch wyłączony. Plik flag: ~/.claude/.krux-context-watch-off.
Żeby włączyć: /krux-context-threshold on (albo usuń plik).
```

### Przypadek 3 — argument to `on`

Wznowienie context_watch (usunięcie pliku flag).

Tool: `Bash` → `rm -f ~/.claude/.krux-context-watch-off`.

Potwierdź:
```
Context watch włączony z powrotem. Próg: bieżąca wartość z .krux-context-threshold (albo default 85000).
```

### Przypadek 4 — argument pusty lub nieznany

Pokaż stan:
1. Czy context_watch wyłączony? Read `~/.claude/.krux-context-watch-off` — jeśli istnieje → „WYŁĄCZONY".
2. Aktualny próg:
   - Read `~/.claude/.krux-context-threshold` → jeśli istnieje i zawiera liczbę → ta wartość
   - Else env `KRUX_CONTEXT_THRESHOLD` (prawdopodobnie pusty)
   - Else default `85000`
3. Pokaż użycie: `/krux-context-threshold <liczba>`, `/krux-context-threshold off`, `/krux-context-threshold on`.

## Prawa

- Nie pisz do `settings.json` — env tam ustawiony NIE dociera do hook child procesów. Plik flag jedyna pewna droga.
- Nie modyfikuj `.krux-mode` — to osobny opt-out (persona), ortogonalny do context_watch.
- Nie twórz innych plików niż dwa wymienione (`.krux-context-threshold`, `.krux-context-watch-off`).
- Nie wymagaj restartu Claude Code — plik flag działa natychmiast, następny Stop hook go zobaczy.

## Przykłady

```
/krux-context-threshold 150000   # podnieś próg
/krux-context-threshold 40000    # wczesne ostrzeżenie
/krux-context-threshold off      # wyłącz zupełnie
/krux-context-threshold on       # włącz z powrotem
/krux-context-threshold          # pokaż stan
```
