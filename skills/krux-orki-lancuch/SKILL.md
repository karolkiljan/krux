---
name: krux-orki-lancuch
description: Użyj gdy potrzebujesz sekwencji orków gdzie jeden wynik = input następnego. Przykłady:
  <example>
  Context: Zrozum a potem napraw
  user: "zrozum bug i napraw go"
  assistant: "Ork-badacz najpierw! Potem ork-tropiciel!"
  <commentary>
  Najpierw badacz rozumie problem, potem tropiciel naprawia
  </commentary>
  </example>
  <example>
  Context: Testy a potem naprawa
  user: "napisz test i jak przejdzie to napraw bug"
  assistant: "Sprawdzacz pisać! Tropiciel naprawiać! Łańcuch!"
  <commentary>
  Najpierw test pokazuje problem, potem fix
  </commentary>
  </example>
argument-hint: <ork1> → <ork2> → ...
---

# Orkowie w Łańcuchu

## Kiedy Użyć

Gdy masz **sekwencję zależnych zadń**:
- Output jednego orka = input następnego
- Kolejność ma znaczenie
- Nie można zrobić równolegle

**Przykłady:**
- Zrozum (badacz) → Napraw (tropiciel)
- Testy (sprawdzacz) → Fix (tropiciel)
- Plan (architekt) → Kod (kowal) → Testy (sprawdzacz)
- Analiza (sędzia) → Fix (tropiciel) → Review (sędzia)

## Jak Użyć

### 1. Zdefiniuj Sekwencję

Każdy ork ma jasną rolę:

```
A (badacz) → B (tropiciel) → C (sprawdzacz)
   ↓              ↓              ↓
 rozumie        naprawia        sprawdza
```

### 2. Wywołaj Sekwencyjnie

NIE równolegle. Jeden po drugim.

A→B→C: B dostaje wynik A, C dostaje wynik B.

### 3. Przekaż Kontekst

**Z A do B:**
- Co A znalazł / zrozumiał
- Plik, linia, przyczyna
- Co B ma zrobić

**Z B do C:**
- Co B naprawił
- Jaki kod zmienił
- Co C ma sprawdzić

## Typowe Łańcuchy

| Łańcuch | Zastosowanie |
|---------|--------------|
| badacz → tropiciel | Najpierw zrozum bug, potem napraw |
| tropiciel → sprawdzacz | Napraw bug, sprawdź czy testy przechodzą |
| architekt → kowal → sprawdzacz | Zaprojektuj → zakoduj → przetestuj |
| skryba → sprawdzacz | Napisz dokumentację → sprawdź czy kompletna |
| sędzia → czyściciel | Review → refaktoryzuj |
| badacz → sędzia → tropiciel | Zrozum → oceń → napraw |

## Struktura Promptu

```
ORK 1: ork-badacz

Zrozum bug w hooks/krux-toggle.js:
- Error: "Cannot read property 'mode' of undefined"
- Gdzie: linia 45
- Co robi kod w tej linii?

Zwróć:
- Co kod robi (proste słowa)
- Gdzie jest problem (plik:linia)
- Dlaczego nie działa

---
ORK 2: ork-tropiciel

Kontekst od ork-badacz:
- Problem: hook próbuje czytać ./.krux-mode ale plik nie istnieje
- Lokalizacja: hooks/krux-toggle.js:45

Zadanie:
- Napraw tak żeby działało gdy plik nie istnieje
- Użyj graceful fallback

Zwróć:
- Kod poprawki
- Czy testy przechodzą

---
ORK 3: ork-sprawdzacz

Kontekst od ork-tropiciel:
- Poprawka: dodano check na fs.existsSync()
- Plik: hooks/krux-toggle.js

Zadanie:
- Uruchom testy
- Jeśli padają → napraw

Zwróć:
- Wynik testów
```

## Błędy

❌ **Zła kolejność:** architekt → sprawdzacz → kowal
✅ **Dobra:** architekt → kowal → sprawdzacz

❌ **Pomijasz kontekst:** "napraw bug" bez wyjaśnienia
✅ **Pełny kontekst:** co poprzedni ork znalazł

❌ **Równolegle gdy zależne:** badacz || tropiciel
✅ **Sekwencyjnie:** badacz → tropiciel

## Werifikacja

Po każdym orku:
1. Przeczytaj output
2. Sprawdź czy sensowny
3. Przekaż dalej lub przerwij jeśli błąd