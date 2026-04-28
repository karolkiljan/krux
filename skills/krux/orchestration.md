# Orkowie — armia generala

Gdy widzę pasujący kontekst → wzywam orka przez `Agent` tool. Nikt nie musi prosić.

**Jedyne źródło prawdy o triggerach:** `agents/triggers.json`.
Czytaj ten plik PRZED wzywaniem orka. Każdy ork ma listę słów kluczowych zsynchronizowanych z jego `description` (test `triggers-sync.test.js` to wymusza).

Rozróżnienie badacz/wyrocznia: `"gdzie jest funkcja X"` → badacz. `"jak działa mechanizm Y"` (koncepcja) → wyrocznia.

Reguły:
- Ork wzywany GDY widzę pasujący kontekst — nie gdy user pyta o coś ogólnego
- Odpowiedź orka zawsze podsumowuję w 1 zdaniu dla usera
- Gdy ork niepotrzebny — robię sam, nie marnuję zasobów
- User nadal może użyć `/krux:ork-nazwa` wprost

## Solo, łańcuch, równolegle — Krux sam decyduje

Krux ocenia zadanie i dobiera formację. Nikt nie prosi — kontekst mówi.

**SOLO — jeden ork:** zadanie wąskie, jedna domena, jeden plik/obszar.
- `napraw bug w krux-toggle.js` → ork-tropiciel
- `napisz testy dla precompact` → ork-sprawdzacz

**ŁAŃCUCH — sekwencja orków:** output A = input B, kolejność wymuszona.
- `zrozum bug → napraw` → badacz → tropiciel
- `naprawić → sprawdzić że nie padło` → tropiciel → sprawdzacz
- `projekt → kod → testy` → architekt → kowal → sprawdzacz
- `review → posprzątać → review` → sędzia → czyściciel → sędzia
- Przekazanie: każdy następny dostać co poprzedni znalazł/zmienił. Plik:linia, diagnoza, zakres.

**RÓWNOLEGLE — kilku orków naraz:** 2+ zadania niezależne, różne domeny/pliki.
- `trzy bugi w trzech plikach` → 3× ork-tropiciel równolegle
- `przetestuj te 5 modułów` → 5× ork-sprawdzacz równolegle
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
- **sonnet:** ork-badacz, ork-sprawdzacz, ork-niszczyciel, ork-skryba, ork-malarz, ork-straznik, ork-wyrocznia, ork-czysciciel (prosty case), ork-tropiciel (prosty case), ork-kowal (jeden endpoint)
- **opus:** ork-sedzia, ork-architekt, ork-wroz, ork-wynalazca, ork-tropiciel (wielowarstwowy bug), ork-czysciciel (refactor wieloplikowy), ork-kowal (projekt API)
- **haiku:** rzadko — tylko gdy zadanie mieści się w jednym grep/read

Powód: subagent zawsze startować zimny — cache miss zapłacony przez spawn. Sonnet zamiast Opus = tańszy token, szybszy output, ten sam cold start. Default Opus dla grep = przepalanie kasy.

## Parsing raportu od orka

- Każdy ork zwraca TYLKO JSON — bez tekstu przed ani po (instrukcja wbudowana w każdy plik orka)
- Schemat: `{ status, summary, details, files?, tests?, verdict? }`
- Do usera: biorę `summary` — 1 zdanie max 30 słów
- `status`: `ok` = sukces, `warning` = ostrzeżenie, `error` = błąd
- Reszta pól = dla mnie, nie dla usera
- Jeśli JSON parse error → `summary` = cały output orka jako plain text
