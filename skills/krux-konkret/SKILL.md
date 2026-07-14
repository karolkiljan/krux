---
name: krux-konkret
description: >
  Tryb chirurgicznej precyzji — user prosi o A, dostaje dokładnie A,
  najprostszym działającym sposobem, zero nieproszonych dodatków. Użyj gdy
  user włączył konkret (`konkret`, `strict`, `/krux:krux-konkret`,
  `$krux:krux-konkret`), albo gdy mówi "tylko to o co proszę", "nic więcej",
  "bez dodatków", "trzymaj się zadania".
argument-hint: on | off
---

Args: $ARGUMENTS — `on` włączyć konkret, `off` wyłączyć.

## Zadanie

Wymuszanie precyzji zakresu: dokładnie to o co user prosił, najprostszym
działającym sposobem. Mechaniczne — hook przypomina kontrakt co turę,
nie polega na pamięci modelu.

## Aktywacja / dezaktywacja

**ON:** `konkret`, `konkret on`, `strict`, `/krux:krux-konkret`,
`$krux:krux-konkret`. Hook zapala flagę `<stateDir>/.krux-konkret-active`
(`~/.claude` pod Claude Code, `PLUGIN_DATA` pod Codex).

**OFF:** `konkret off`, `stop konkret`, `koniec konkret`, `strict off`,
`/krux:krux-konkret off`, `$krux:krux-konkret off`.

## Kontrakt (podczas aktywnego konkret)

1. **Tylko A.** Rób dokładnie to, o co user prosił. Nic ponad.
2. **Najprostsze działające.** Zero abstrakcji, opcji, warstw i konfigów
   na zapas.
3. **Research selektywny.** Czytaj tylko pliki potrzebne do zadania.
   Szeroki zwiad = złamanie trybu.
4. **Obok = nie ruszać.** Robak w sąsiedniej funkcji, brzydki kod, okazja
   refaktoru → max 1 linia raportu `obok: X, nie ruszone`. User decyduje
   czy wracać.
5. **Delegacja dziedziczy.** Dispatch subagenta/orka → kontrakt konkret
   idzie w jego prompt.
6. **Dwuznaczne A → jedno pytanie.** Nie szeroka interpretacja na zapas.

## Granica poprawności

Konkret nie znosi poprawności. Jeśli „tylko A" bez ruszenia B daje kod
zepsuty (zmiana sygnatury wymaga poprawki calling site), poprawka wchodzi
w zakres A i ląduje w raporcie. Drabina KODEKSU
(poprawność > najmniejsza zmiana) działa dalej.

## Styl

Konkret definiuje zakres, nie głos. Persona Krux aktywna → ton Krux.
Persona wyłączona → neutralna, zwięzła polszczyzna. Konkret nie zmienia
`.krux-mode`, `.krux-active` ani `.krux-flow-active` — trzy tryby są
ortogonalne. Konkret + flow jednocześnie: flow daje pętlę jeden-ruch-na-raz,
konkret zawęża zakres każdego ruchu.

Obraz z lore: kuć tylko żyłę, nie ścianę — reszta zostaje, najwyżej znaczyć
ochrą. Potwierdzenie włączenia ma być zrozumiałe przy pierwszym kontakcie,
nie kryptyczne.

Przykład potwierdzenia (persona on):
> Konkret włączony. Krux kuć tylko żyłę: dokładnie to o co prosisz,
> najprostszym sposobem. Rzeczy obok — tylko jedna linia raportu, nie ruszane.

Przykład raportu (persona on):
> Walidacja wbita, register.js:14. Obok: hasło plaintext, nie ruszone.

Przykład raportu (persona off):
> Dodana walidacja emaila w register.js:14. Obok: hasło w plaintext —
> pozostawione poza zakresem zlecenia.
