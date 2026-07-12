---
name: krux-release
description: >
  Release flow: bump wersji + commit w konwencji "feat: vX.Y.Z — opis" + tag.
  Użyj gdy user mówi "release", "wydanie", "wypuść X.Y.Z", wywołuje /krux:krux-release
  albo chce zamknąć wersję pluginu.
argument-hint: patch|minor|major|X.Y.Z [— opis release]
disable-model-invocation: true
---

## Cel

Zamknąć release zgodnie z sekcją „Publikacja” w CLAUDE.md — `feat: vX.Y.Z — opis` + tag `vX.Y.Z`. Nic ręcznie.

## Wykonanie

Argument: `$ARGUMENTS`

### Krok 1 — walidacja stanu repo

1. Uruchom `git status --porcelain`.
2. Jeśli drzewo brudne — także gdy zmieniony jest którykolwiek z trzech manifestów — **zatrzymaj się**, zgłoś: `Drzewo brudne. Najpierw scommituj robotę albo zestashuj. Release nie ruszać cudzych plików`.
3. Jeśli HEAD nie na `master` — ostrzeż i zapytaj o potwierdzenie przed dalej.

### Krok 2 — parsuj argumenty

Format: `<bump-spec> [— opis]` lub `<bump-spec> [- opis]` lub `<bump-spec> opis`.

- `bump-spec`: pierwszy token (`patch`|`minor`|`major`|semver `X.Y.Z`)
- `opis`: reszta, jeden liner. Jeśli pusty → wygeneruj z `git log --oneline <last-tag>..HEAD` (skrót 3-8 wyrazów).

Odczytaj obecną wersję i wylicz wersję docelową tymi samymi regułami co `krux-bump`.
Przed zmianą plików sprawdź `git rev-parse -q --verify "refs/tags/vDOCELOWA"`.
Tag istnieje → przerwij bez bumpa i commita.

### Krok 3 — bump wersji

Wywołaj skill `krux-bump` z argumentem `bump-spec`. Czekaj na potwierdzenie (trzy pliki zmienione).

Odczytaj nową wersję z `package.json` (żeby mieć finalny numer, nawet gdy `bump-spec` to słowo kluczowe).
Musi być identyczna z wersją docelową wyliczoną przed bumpem.

### Krok 4 — commit

```bash
git add package.json .claude-plugin/plugin.json .claude-plugin/marketplace.json
```

Przed commitem sprawdź `git diff --cached --name-only`. Lista ma zawierać dokładnie
te trzy manifesty — inny lub brakujący plik → przerwij bez commita.

```bash
git commit -m "feat: vNOWA — OPIS"
```

Subject ≤72 znaków. Bez ciała. Bez atrybucji AI.

### Krok 5 — tag

Przed utworzeniem tagu odczytaj wersje z `package.json`, `.claude-plugin/plugin.json`
i `.claude-plugin/marketplace.json`. Jeśli nie są identyczne, przerwij — nie twórz tagu.

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
- Commit subject: zawsze `feat:` dla release, nawet gdy release to głównie fix. Konwencja repo — sekcja „Publikacja” w CLAUDE.md.
- Jeśli opis pusty i brak tagów w repo → użyj `release vX.Y.Z`.

## Przykłady

```
/krux:krux-release patch — poprawki regex toggle
/krux:krux-release minor — nowy hook X
/krux:krux-release 2.0.0 — spec rewrite, breaking
/krux:krux-release patch                           # opis z git log
```
