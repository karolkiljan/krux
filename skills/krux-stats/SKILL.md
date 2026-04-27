---
name: krux-stats
description: >
  Pokazuje statystyki tokenów z logu krux. Użyj gdy user pyta o oszczędność
  tokenów, efekt persony, ile Krux zaoszczędził, lub wywołuje /krux-stats.
argument-hint: [--all | --session <id> | --last <N>]
disable-model-invocation: true
---

## Wykonanie

Plik logu: `~/.claude/.krux-token-log.jsonl` (jeden JSON per linia, append-only).

### Krok 1 — odczyt

Bash: `cat ~/.claude/.krux-token-log.jsonl 2>/dev/null || echo ""`

Pusto → `Brak danych. Log zacznie zbierać przy pierwszym Stop hooku.`

### Krok 2 — argumenty

`$ARGUMENTS`:
- `--last N` → ostatnie N wpisów
- `--session <id>` → tylko ta sesja
- `--all` lub pusto → wszystkie

Jeden JSON parse error → przeskocz linię, kontynuuj.

### Krok 3 — agregacja

Dla każdej grupy (`krux_active=true` vs `krux_active=false`) policz:
- liczba turns
- avg `output_tokens`
- avg `input_tokens`
- median `output_tokens`
- p95 `output_tokens`

### Krok 4 — raport

Format (krux style):

```
KRUX TELEMETRIA — last N turns

ON:  N turns | avg out: X | median: Y | p95: Z
OFF: N turns | avg out: X | median: Y | p95: Z

Delta avg out: -X% (krux ON vs OFF)
Delta median:  -X%
```

Grupa OFF pusta → `Brak baseline. Wyłącz krux na 5+ turns dla porównania.`

## Prawa

- Nie czyść loga automatycznie. User decyduje (manual rm).
- Nie pisz do loga z tego skilla — log append-only z hooka.
- Output zawsze zwięzły. Liczby pierwsze, komentarz drugi.
