---
name: krux-orki-równolegle
description: Użyj gdy użytkownik chce wykonać wiele niezależnych zadań jednocześnie. Przykłady:
  <example>
  Context: 3 niezależne bugi do naprawienia
  user: "napraw wszystkie 3 bugi naraz"
  assistant: "Wysłać 3 orków na bitwę! Równolegle!"
  <commentary>
  Użyj gdy zadania nie zależą od siebie i mogą być wykonane jednocześnie
  </commentary>
  </example>
  <example>
  Context: Wiele plików do przetestowania
  user: "przetestuj te 5 plików równolegle"
  assistant: "Ork-sprawdzacz i ork-sprawdzacz i ork-sprawdzacz! Razem!"
  <commentary>
  Każdy ork dostaje jeden plik, pracują jednocześnie
  </commentary>
  </example>
argument-hint: <orka1> <orka2> ...
---

# Orkowie Równolegle

## Kiedy Użyć

Gdy masz **2+ niezależne zadania** które:
- Nie dzielą stanu
- Nie zależą od siebie
- Mogą być wykonane jednocześnie

**Przykłady:**
- 3 bugi w różnych plikach
- 5 testów do napisania równolegle
- Review wielu plików naraz

**Nie używaj gdy:**
- Zadania się zależą (output A = input B)
- Ten sam plik do edycji
- Wspólny stan (np. jedna baza danych)

## Jak Użyć

### 1. Podziel na niezależne domeny

Każde zadanie = jeden ork.

```
Zadanie 1: napraw bug w hooks/krux-toggle.js → ork-tropiciel
Zadanie 2: napraw bug w hooks/auto-test.js → ork-tropiciel
Zadanie 3: napisz testy dla hooks/precompact.js → ork-sprawdzacz
```

### 2. Wywołaj Równolegle

Zrób wiele `Agent` call naraz (równolegle, nie sekwencyjnie).

### 3. Połącz Wyniki

Gdy orkowie wrócą:
- Przeczytaj każde podsumowanie
- Sprawdź czy nie ma konfliktów
- Uruchom pełny test suite
- Połącz zmiany

## Struktura Promptu

Dla każdego orka:
- **Zakres:** Jeden plik / jedno zadanie
- **Cel:** Co dokładnie zrobić
- **Ograniczenia:** Czego NIE robić
- **Output:** Co zwrócić

```
ork-tropiciel: Napraw bug w hooks/krux-toggle.js (linia 45)

1. Bug: "Cannot read property 'mode' of undefined"
2. Kontekst: plik hooka jest załadowany ale .krux-mode nie istnieje
3. Cel: Napraw tak żeby działało gdy plik nie istnieje
4. Ograniczenia: Nie zmieniaj innych hooków
5. Zwróć: co naprawiłeś i czy testy przechodzą
```

## Typowe Błędy

❌ **Za szeroko:** "napraw wszystkie bugi" → ork ginie
✅ **Wąsko:** "napraw bug w pliku X" → focus

❌ **Brak kontekstu:** "napraw błąd" → skąd ork ma wiedzieć?
✅ **Z kontekstem:** wklej error message i lokalizację

❌ **Ograniczeń zero:** ork może refaktoryzować wszystko
✅ **Ograniczenia:** "Tylko napraw testy, nie dotykaj produkcji"

## Werifikacja

Po powrocie orków:
1. **Przeczytaj podsumowania** — co się zmieniło
2. **Sprawdź konflikty** — czy dwa orki nie edytowały tego samego?
3. **Uruchom suite** — wszystko działa razem?
4. **Spot check** — orkowie mogą robić systematyczne błędy