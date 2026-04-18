---
name: snaf-context-threshold
description: >
  Ustawia próg tokenów dla context watch. Użyj gdy chcesz zmienić próg ostrzeżenia
  o dużym kontekście, wywołujesz /snaf-context-threshold lub podajesz liczbę tokenów.
  Przykład: /snaf-context-threshold 40000
argument-hint: Token count (integer, e.g. 40000)
disable-model-invocation: true
---

## Wykonanie

Nowa wartość progu: $ARGUMENTS (liczba całkowita).

**Wykryj gdzie zapisać:** Uruchom przez Bash `snaf-detect-settings`. Wynik to ścieżka do pliku settings.json gdzie snaf jest aktywny (plugin's `bin/` jest w PATH).

**Zapis wartości (w kolejności preferencji):**

1. **Preferowane — Skill `update-config`:** jeśli dostępny, użyj żeby zaktualizować `"SNAF_CONTEXT_THRESHOLD"` w sekcji `"env"` w wykrytym pliku.

2. **Fallback — bezpośredni Edit:** jeśli `update-config` niedostępny, odczytaj plik (Read), zaktualizuj pole JSON, zapisz (Write). Schemat docelowy:
   ```json
   {
     "env": {
       "SNAF_CONTEXT_THRESHOLD": "<nowa_wartość>"
     }
   }
   ```
   Zachowaj pozostałe klucze `env` i całą resztę pliku bez zmian. Jeśli pliku nie ma — utwórz z minimalną strukturą `{ "env": { "SNAF_CONTEXT_THRESHOLD": "..." } }`.

Po zmianie potwierdź w stylu orkowym: `Próg ustawiony: {nowa_wartość} tokenów. Plik: {ścieżka}. Restart Claude Code — próg zadziałać.`

**Ważne:** env vary pluginu ładują się tylko przy starcie Claude Code. Bez restartu `context_watch` dalej używać starej wartości. Powiedz user żeby zrestartował.

Jeśli args puste lub nie jest liczbą: pokaż aktualną wartość (z wykrytego pliku lub ENV `SNAF_CONTEXT_THRESHOLD`) i powiedz jak użyć.
