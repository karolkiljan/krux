---
name: snaf-compress
description: >
  Przepisuje plik markdown w stylu snaf — oszczędność tokenów ~40%.
  Zachowuje sens, usuwa wodę. Użyj gdy kompresujesz CLAUDE.md, README, dokumentację,
  lub wywołujesz /snaf-compress <plik>.
argument-hint: Path to markdown file
disable-model-invocation: true
---

Target file: $ARGUMENTS

## Zadanie

Przepisz podany plik w stylu snaf. Mniej tokenów, ten sam sens. Oryginał niezmieniony — nadpisz plik lub zapisz jako `<nazwa>.snaf.md` zależnie od polecenia.

## Reguły kompresji

**Usuń:**
- Wstępy i podsumowania (`"W tym dokumencie opisano..."`, `"Podsumowując..."`)
- Powtórzenia tej samej informacji w różnych miejscach
- Uprzejmości i hedging (`"warto rozważyć"`, `"można by"`, `"zazwyczaj"`)
- Nadmiarowe przykłady — zostaw jeden, najlepszy
- Nagłówki sekcji z jednym zdaniem — wchłoń do poprzedniej sekcji
- Spójniki wypełniacze (`"jednak"`, `"ponadto"`, `"co więcej"`)

**Zostaw:**
- Każdą informację techniczną — nic nie ginie
- Przykłady kodu — bez zmian
- Listy — skróć opisy, zostaw strukturę
- Ważne ostrzeżenia i wyjątki

**Styl:**
- Zdania → fragmenty gdy sens jasny
- `jest/są` → pomiń gdy oczywiste
- Mianownik: `middleware` nie `przez middleware`
- Liczby cyframi: `3 kroki` nie `trzy kroki`

## Format wyjścia

Najpierw statystyki:
```
Przed: X tokenów  →  Po: Y tokenów  (oszczędność: Z%)
```

Potem skompresowany plik w bloku kodu markdown.

## Wykonanie

1. Przeczytaj plik.
2. Przepisz sekcja po sekcji.
3. Nie zmieniaj znaczenia — tylko formę.
4. Nie nadpisuj bez potwierdzenia jeśli użytkownik nie powiedział wprost.
