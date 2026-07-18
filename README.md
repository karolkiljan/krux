# Krux

Krux = minimalny plugin dla Claude Code i Codex: zwięzły polski głos technicznego orka oraz sześciu specjalistów ładowanych tylko wtedy, gdy robota ich potrzebuje.

## Co zostaje w kontekście

Persona wchodzi przez `SessionStart` przy `startup`, `clear` i `source=compact`. Zwykły prompt, narzędzie, resume, start subagenta i Stop dodają 0 słów. Stan trzymają trzy niezależne flagi w katalogu danych pluginu: `.krux-mode`, `.krux-konkret`, `.krux-flow`.

## Instalacja

Plugin rozwijany jest lokalnie — instaluj z lokalnego klonu repozytorium.
Publiczne repo na GitHubie może być starsze niż lokalny master i wtedy
zainstaluje inną wersję niż opisana niżej.

### Claude Code

```bash
claude plugin marketplace add /ścieżka/do/klonu/krux
claude plugin install krux@krux-marketplace
```

### Codex

```bash
codex plugin marketplace add /ścieżka/do/klonu/krux
codex plugin add krux@krux-marketplace
```

W obu hostach przejrzyj i zaufaj jednej komendzie hooka `node .../hooks/krux.js`, potem otwórz świeżą sesję.

## Użycie

- `wyłącz krux` jako cała wiadomość → trwały tryb neutralny.
- `włącz krux` jako cała wiadomość → trwały głos Kruxa.
- `włącz konkret` / `wyłącz konkret` → tryb precyzji zakresu: tylko proszone, nic więcej.
- `włącz flow` / `wyłącz flow` → tryb iteracyjny: jeden ruch na raz, zgoda przed egzekucją.
- Claude: `/krux:krux-horda`; Codex: `$krux:krux-horda` → mapa specjalistów na żądanie.

| Ork | Fach |
|---|---|
| Niuch | debug i eksploracja |
| Grom | backend i dane |
| Piryt | review i ryzyko |
| Ochra | frontend i UI |
| Młot | testy i weryfikacja |
| Lont | bezpieczne usuwanie i refaktor |

Krux deleguje tylko przy specjalizacji, izolacji kontekstu albo realnej równoległości. Drobnicę robi sam.

## Zmiany w 3.3.0

Domknięta sesja kalibracyjna głosu — 10 rund odwróconego few-shot
z autorem (zapis: `docs/superpowers/specs/2026-07-17-sesja-kalibracyjna-morra.md`):

- Kapsuła persony ma 20 par „Ludzie / Krux". Nowe pary z rund 8–10:
  **relacja błędu** (komunikat kompilatora co do znaku, głos tylko na
  brzegach zdania, „wygląda na to" zostaje — hipoteza ma brzmieć jak
  hipoteza), **podziękowanie** (ciepło wprost, bez dworskich ukłonów)
  i **podsumowanie roboty** (liczby i ścieżki nietykalne, żart
  z własnej małomówności dozwolony).
- Słownik żywy urósł o: goniec = odpowiedź w drodze (pusta odpowiedź
  = goniec z pustymi rękami), tykać = zmieniać plik, pognać = wygonić
  zbędne.

## Wymagania i rozwój

- macOS lub Linux;
- Claude Code lub Codex;
- Node.js 18+ w `PATH`;
- brak `npm install` i brak zależności runtime.

```bash
npm test
```

## Licencja

MIT. Projekt nie jest powiązany z innymi produktami o nazwie Krux.
