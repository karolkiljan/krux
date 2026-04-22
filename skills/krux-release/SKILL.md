---
name: krux-release
description: >
  Release flow: bump wersji + commit w konwencji "feat: vX.Y.Z — opis" + tag.
  Użyj gdy user mówi "release", "wydanie", "wypuść X.Y.Z", wywołuje /krux-release
  albo chce zamknąć wersję pluginu.
argument-hint: patch|minor|major|X.Y.Z [— opis release]
disable-model-invocation: true
---

## Cel

Zamknąć release zgodnie z konwencją CLAUDE.md:118 — `feat: vX.Y.Z — opis` + tag `vX.Y.Z`. Nic ręcznie.

## Wykonanie

Argument: `$ARGUMENTS`

### Krok 1 — walidacja stanu repo

1. Uruchom `git status --porcelain`.
2. Jeśli drzewo brudne (są zmiany poza `package.json` / `plugin.json`) → **zatrzymaj się**, zgłoś: `Drzewo brudne. Najpierw scommituj robotę albo zestashuj. Release nie ruszać cudzych plików`.
3. Jeśli HEAD nie na `master` — ostrzeż i zapytaj o potwierdzenie przed dalej.

### Krok 2 — parsuj argumenty

Format: `<bump-spec> [— opis]` lub `<bump-spec> [- opis]` lub `<bump-spec> opis`.

- `bump-spec`: pierwszy token (`patch`|`minor`|`major`|semver `X.Y.Z`)
- `opis`: reszta, jeden liner. Jeśli pusty → wygeneruj z `git log --oneline <last-tag>..HEAD` (skrót 3-8 wyrazów).

### Krok 3 — bump wersji

Wywołaj skill `krux-bump` z argumentem `bump-spec`. Czekaj na potwierdzenie (dwa pliki zmienione).

Odczytaj nową wersję z `package.json` (żeby mieć finalny numer, nawet gdy `bump-spec` to słowo kluczowe).

### Krok 4 — commit

```bash
git add package.json .claude-plugin/plugin.json
git commit -m "feat: vNOWA — OPIS"
```

Subject ≤72 znaków. Bez ciała. Bez atrybucji AI.

### Krok 5 — tag

```bash
git tag vNOWA
```

Annotated tag opcjonalny (`-a` + message) — domyślnie lightweight, to zgodne z obecnym repo.

### Krok 6 — raport

Wypisz:
```
Release vNOWA gotowy.
Commit: <skrócony-sha>
Tag: vNOWA
Push ręcznie: git push origin master --tags
```

## Prawa

- **Nie push-uj automatycznie.** User ma sam zdecydować. CLAUDE.md milczy o auto-pushu — bezpieczniej ręcznie.
- Nie wydawaj release z brudnego drzewa.
- Nie nadpisuj istniejącego tagu — jeśli `v<NOWA>` już istnieje, przerwij z komunikatem.
- Commit subject: zawsze `feat:` dla release, nawet gdy release to głównie fix. Konwencja repo — CLAUDE.md:118.
- Jeśli opis pusty i brak tagów w repo → użyj `release vX.Y.Z`.

## Przykłady

```
/krux-release patch — poprawki regex toggle
/krux-release minor — hook version-sync-guard
/krux-release 2.0.0 — spec rewrite, breaking
/krux-release patch                           # opis z git log
```
