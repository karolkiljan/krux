---
name: krux-bump
description: >
  Atomowy bump wersji: synchronizuje package.json, .claude-plugin/plugin.json
  i .claude-plugin/marketplace.json. Użyj gdy chcesz podbić wersję pluginu,
  wywołujesz /krux-bump, albo user mówi "bump wersji", "patch/minor/major", "X.Y.Z".
argument-hint: patch | minor | major | X.Y.Z (np. 1.10.0)
disable-model-invocation: true
---

## Cel

Jednym ruchem zmienić wersję w trzech plikach źródłowych pluginu. CLAUDE.md:112-114 wymaga synchronizacji — ten skill jest egzekutorem tej reguły.

## Wykonanie

Argument: `$ARGUMENTS`

### Krok 1 — odczyt obecnej wersji

1. Read `package.json` — pole `.version`
2. Read `.claude-plugin/plugin.json` — pole `.version`
3. Read `.claude-plugin/marketplace.json` — pole `.plugins[0].version`
4. Jeśli którakolwiek różna → **zatrzymaj się**, zgłoś problem: `Wersje rozjechane: package.json=X, plugin.json=Y, marketplace.json=Z. Podaj docelową wersję albo napraw ręcznie`.

### Krok 2 — wyznacz nową wersję

Obecna wersja: `MAJOR.MINOR.PATCH`.

- `patch` → `MAJOR.MINOR.(PATCH+1)`
- `minor` → `MAJOR.(MINOR+1).0`
- `major` → `(MAJOR+1).0.0`
- `X.Y.Z` (format semver) → użyj wprost
- pusty argument → pokaż obecną wersję + pomoc i wyjdź

### Krok 3 — zapis

1. Edit `package.json`: `"version": "STARA"` → `"version": "NOWA"`
2. Edit `.claude-plugin/plugin.json`: analogicznie
3. Edit `.claude-plugin/marketplace.json`: w `plugins[0].version` analogicznie

### Krok 4 — potwierdzenie

Wypisz jednym zdaniem: `Wersja NOWA ustawiona. Trzy pliki zsynchronizowane. Czas na commit`.

## Prawa

- Nie commituj. Nie taguj. Nie push. To robi `krux-release`.
- Nie ruszaj innych pól niż `version`.
- Nie modyfikuj `README.md`, `CHANGELOG.md`, testów — poza scope.
- Walidacja semver: trzy liczby oddzielone kropkami. Nic więcej. Pre-release (`-rc1`) też dopuszczalny.

## Przykłady

```
/krux-bump patch      # 1.9.1 → 1.9.2
/krux-bump minor      # 1.9.1 → 1.10.0
/krux-bump major      # 1.9.1 → 2.0.0
/krux-bump 2.0.0-rc1  # wprost
/krux-bump            # pokaż obecną + pomoc
```
