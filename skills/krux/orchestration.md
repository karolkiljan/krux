# Orkowie — armia generala

Gdy widzę pasujący kontekst → wzywam orka przez `Agent` tool. Nikt nie musi prosić.

**Jedyne źródło prawdy o triggerach:** `agents/triggers.json`.
Czytaj ten plik PRZED wzywaniem orka. Każdy ork ma listę słów kluczowych zsynchronizowanych z jego `description` (test `triggers-sync.test.js` to wymusza).

Rozróżnienie badacz/wyrocznia: `"gdzie jest funkcja X"` → badacz. `"jak działa mechanizm Y"` (koncepcja) → wyrocznia.

Reguły:
- Ork wzywany GDY widzę pasujący kontekst — nie gdy user pyta o coś ogólnego
- Każdy prompt spawnu zawiera jawne `persona=on` albo `persona=off`; subagent nie dziedziczy kontekstu persony. Stan bierz z bieżącego trybu Krux, a przy niepewności z pliku `~/.claude/.krux-active`
- `summary` orka daje pierwsze zdanie dla usera. Po nietrywialnej zmianie składam
  z `details`, `files` i `tests` pełny kontrakt raportu z `robota.md`; nie chowam
  przepływu, powodu, ścieżki błędu ani weryfikacji za jednym zdaniem.
- Gdy ork niepotrzebny — robię sam, nie marnuję zasobów
- User nadal może użyć `@krux:ork-nazwa` wprost

## Solo, łańcuch, równolegle — Krux sam decyduje

Krux ocenia zadanie i dobiera formację. Nikt nie prosi — kontekst mówi.

**SOLO — jeden ork:** zadanie wąskie, jedna domena, jeden plik/obszar.
- `napraw bug w krux-toggle.js` → `@krux:ork-tropiciel`
- `napisz testy dla context_watch` → `@krux:ork-sprawdzacz`

**ŁAŃCUCH — sekwencja orków:** output A = input B, kolejność wymuszona.
- `zrozum bug → napraw` → `@krux:ork-badacz` → `@krux:ork-tropiciel`
- `naprawić → sprawdzić że nie padło` → `@krux:ork-tropiciel` → `@krux:ork-sprawdzacz`
- `projekt → kod → testy` → `@krux:ork-architekt` → `@krux:ork-kowal` → `@krux:ork-sprawdzacz`
- `review → posprzątać → review` → `@krux:ork-sedzia` → `@krux:ork-czysciciel` → `@krux:ork-sedzia`
- Przekazanie: każdy następny dostać `persona=on|off` oraz co poprzedni znalazł/zmienił. Plik:linia, diagnoza, zakres.

**RÓWNOLEGLE — kilku orków naraz:** 2+ zadania niezależne, różne domeny/pliki.
- `trzy bugi w trzech plikach` → 3× `@krux:ork-tropiciel` równolegle
- `przetestuj te 5 modułów` → 5× `@krux:ork-sprawdzacz` równolegle
- Wywołać przez wiele `Agent` wywołań w jednej wiadomości.
- Po powrocie: sprawdzić konflikty edycji + pełny test suite.

**ANTY — kiedy NIE:**
- ten sam plik dla dwóch orków → nie równolegle (konflikt edycji)
- brak zależności między zadaniami → nie łańcuch (niepotrzebna sekwencja)
- jedno trywialne zadanie → nie ork wcale, Krux robi sam

## Model — sonnet czy opus

Krux wybiera model przy każdym spawnie orka. Parametr `model` w `Agent` tool: `"sonnet"` | `"opus"` | `"haiku"`. Pominięcie = dziedziczy po parent (zwykle Opus) = drogo.

Reguła kciuka:
- zadanie w jednym pliku + jedna akcja → **sonnet**
- rozumowanie między plikami, projekt, trade-off → **opus**
- trywialne lookup (grep jednego stringa, odczyt jednej linii) → **haiku**

Mapowanie orków (default, można łamać gdy kontekst mówi inaczej):
- **sonnet:** `@krux:ork-badacz`, `@krux:ork-sprawdzacz`, `@krux:ork-niszczyciel`, `@krux:ork-skryba`, `@krux:ork-malarz`, `@krux:ork-straznik`, `@krux:ork-wyrocznia`, `@krux:ork-czysciciel` (prosty case), `@krux:ork-tropiciel` (prosty case), `@krux:ork-kowal` (jeden endpoint)
- **opus:** `@krux:ork-sedzia`, `@krux:ork-architekt`, `@krux:ork-wroz`, `@krux:ork-wynalazca`, `@krux:ork-tropiciel` (wielowarstwowy bug), `@krux:ork-czysciciel` (refactor wieloplikowy), `@krux:ork-kowal` (projekt API)
- **haiku:** rzadko — tylko gdy zadanie mieści się w jednym grep/read

Powód: subagent zawsze startować zimny — cache miss zapłacony przez spawn. Sonnet zamiast Opus = tańszy token, szybszy output, ten sam cold start. Default Opus dla grep = przepalanie kasy.

## Parsing raportu od orka

- Każdy ork zwraca TYLKO JSON — bez tekstu przed ani po (instrukcja wbudowana w każdy plik orka)
- Schemat: `{ status, summary, details, files?, tests?, verdict? }`
- Do usera: `summary` jako wynik — 1 zdanie max 30 słów.
- `status`: `ok` = sukces, `warning` = ostrzeżenie, `error` = błąd.
- Przy prostej odpowiedzi `summary` może wystarczyć. Po nietrywialnej zmianie
  użyj `details`, `files` i `tests`, żeby raport zawierał: Jak działa, Dlaczego
  tak, Czytaj od i Weryfikacja. Nie wklejaj surowego JSON.
- Jeśli JSON parse error → `summary` = cały output orka jako plain text
