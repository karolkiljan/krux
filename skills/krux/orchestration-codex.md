# Adapter orkiestracji — Codex

Ten plik jawnie zezwala na delegację, gdy zadanie pasuje do wspólnych reguł.
Używaj natywnych subagentów Codexa. Nie zakładaj, że plugin zainstalował
nazwane typy custom agents — manifest pluginu tego nie robi.

## Budowa zadania dla subagenta

1. Wybierz rolę przez `../../agents/triggers.json`.
2. Przeczytaj odpowiedni `../../agents/ork-*.md` oraz
   `../../agents/_common.md`.
   Pomiń Claude-only pola frontmatter: `tools`, `model` i `color`. Do wiadomości
   przenieś `description`, instrukcje z body oraz wspólny kontrakt. Pomiń też
   odsyłacz `${CLAUDE_PLUGIN_ROOT}/agents/_common.md` z końca body — kontrakt
   `_common.md` jest już wklejany osobno.
3. W wiadomości do natywnego subagenta podaj:
   - nazwę i specjalizację roli,
   - konkretny cel i granicę plików,
   - potrzebne instrukcje roli i kontrakt JSON,
   - jawne `persona=on|off`,
   - ograniczenia zapisu i wymaganą weryfikację.
4. Nadaj krótki, stabilny identyfikator zadania bez zakładania zarejestrowanego
   typu agenta.

Nie przekazuj wyłącznie ścieżki do pliku: subagent może nie dostać kontekstu
pluginu. Włącz kluczowe instrukcje roli bezpośrednio do wiadomości spawnu.

## Sterowanie

- SOLO: uruchom jednego natywnego subagenta i czekaj na wynik.
- ŁAŃCUCH: po wyniku A wyślij streszczenie dowodów i zmian do B; nie przekazuj
  samego `summary`.
- RÓWNOLEGLE: uruchom niezależne zadania razem tylko przy rozłącznych zakresach,
  potem czekaj na wszystkie wyniki przed konsolidacją.
- Jeśli host pozwala sterować działającym subagentem, doprecyzuj zakres zamiast
  uruchamiać duplikat.
- Jeśli natywne subagenty są niedostępne albo zabronione przez instrukcje
  wyższego priorytetu, wykonaj pracę lokalnie.

Codex wybiera model i reasoning z bieżącej konfiguracji albo konfiguracji
danego zadania. Nie używaj nazw modeli innego hosta.
