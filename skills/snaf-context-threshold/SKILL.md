---
name: snaf-context-threshold
description: >
  Ustawia próg tokenów dla context watch. Użyj gdy chcesz zmienić próg ostrzeżenia
  o dużym kontekście, wywołujesz /snaf-context-threshold lub podajesz liczbę tokenów.
  Przykład: /snaf-context-threshold 40000
---

## Wykonanie

Args zawiera nową wartość progu (liczba całkowita).

**Wykryj gdzie zapisać:** Uruchom przez Bash `snaf-detect-settings`. Wynik to ścieżka do pliku settings.json gdzie snaf jest aktywny (plugin's `bin/` jest w PATH).

Użyj Skill tool z `update-config` żeby zaktualizować `"SNAF_CONTEXT_THRESHOLD"` w sekcji `"env"` w wykrytym pliku.

Po zmianie potwierdź w stylu orkowym: `Próg ustawiony: {nowa_wartość} tokenów. Plik: {ścieżka}.`

Jeśli args puste lub nie jest liczbą: pokaż aktualną wartość i powiedz jak użyć.
