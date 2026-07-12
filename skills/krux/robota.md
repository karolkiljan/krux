# Kodeks roboty — pełny workflow

Czytaj przy analizie, zmianie, testowaniu lub raportowaniu kodu. Drabina
priorytetów z `SKILL.md` rozstrzyga konflikty między CIĘCIAMI.

## Sześć CIĘĆ

1. **Granica przed robotą.** Nazwij efekt i kryterium gotowości. Wybierz jedną
   najlepszą implementację. Nie dodawaj zależności, warstw ani ścieżek na zapas.
   Nie pytaj o fakty możliwe do bezpiecznego ustalenia w repo; jedna brakująca
   decyzja zmieniająca poprawny wynik uzasadnia jedno konkretne pytanie.
2. **Czytaj selektywnie.** Zacznij od entry pointu, najbliższej analogii,
   zależności, konsumentów i testów. Rozszerz zwiad po konkretnym tropie. Nazwij
   wzorzec przed wyborem rozwiązania.
3. **Reuse przed budową.** Szukaj istniejącej funkcji, typu, komponentu, helpera
   i fixture. Rozszerz stabilny kontrakt zamiast tworzyć równoległy. Helper
   wyodrębnij tylko dla reuse, pojęcia domenowego albo wyraźnie prostszego flow.
4. **Kontynuuj pattern.** Zachowaj lokalne nazwy, sygnatury, przepływ danych,
   błędy, async, DI i testy. Hierarchia: instrukcje repo > najbliższy wzorzec >
   konwencja modułu > standard ekosystemu > preferencja. Nie kopiuj wzorca
   niebezpiecznego; zrób najmniejsze bezpieczne odstępstwo i wyjaśnij je.
5. **Buduj czysto.** Preferuj jawny liniowy flow. Ogranicz zagnieżdżenia i ukryte
   skutki; zachowaj spójne typy zwrotne i błędy. Bez martwego kodu, scaffoldu,
   zakomentowanych wariantów, dwóch ścieżek bez wymogu kompatybilności i fixów
   hardkodowanych pod fixture.
6. **Sprawdź i stój.** Najpierw najwęższe testy, potem walidacja proporcjonalna do
   ryzyka. Sprawdź lint, typy i formatowanie, jeśli repo ich używa. Przejrzyj diff,
   usuń własne pliki tymczasowe i zbędny churn. Gotowe + zielone testy = koniec.
   Raportuj wyłącznie wykonane sprawdzenia oraz jawne luki.

## Kontrakt raportu

Po nietrywialnej zmianie podaj:

1. **Wynik** — jedno zdanie o działającym efekcie.
2. **Jak działa** — 2–5 kroków, kluczowe symbole i istotna ścieżka błędu.
3. **Dlaczego tak** — lokalny wzorzec albo użyty istniejący element.
4. **Czytaj od** — najwyżej trzy pliki lub symbole, gdy flow obejmuje kilka.
5. **Weryfikacja** — wykonane testy i pozostałe luki.

Prostą zmianę opisz w 2–4 zdaniach. Nie wklejaj zapisanego kodu ani planu. Jeśli
flow nie daje się prześledzić w kilku krokach, uprość albo nazwij konieczną
złożoność.
