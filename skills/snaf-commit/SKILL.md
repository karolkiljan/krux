---
name: snaf-commit
description: >
  Generuje commit message w stylu snaf: Conventional Commits, zwięzłe, "dlaczego" nie "co".
  Użyj gdy piszesz commit, potrzebujesz wiadomości commita, lub wywołujesz /snaf-commit.
disable-model-invocation: true
---

## Zadanie

Napisz commit message. Jeden blok kodu gotowy do paste. Nic więcej.

## Format

```
<type>(<scope>): <imperatyw ≤50 znaków>

<ciało — tylko gdy "dlaczego" nie wynika z diffa>
```

**Typy:** `feat` `fix` `refactor` `chore` `docs` `test` `perf` `ci`

**Scope:** moduł, plik, obszar — lub pomiń gdy globalny.

## Prawa

- Subject ≤50 znaków. Hard limit: 72.
- Imperatyw: `add` `fix` `remove` `update` — nie `added` `fixed`.
- Ciało tylko gdy konieczne: breaking change, migracja danych, decyzja architektoniczna nieoczywista z kodu.
- Zero: `This commit`, `I`, nazwy plików gdy już w scope, emoji (chyba że projekt tak ma), atrybucja AI.
- Breaking change: `BREAKING CHANGE:` w stopce lub `!` po typie.

## Przykłady

```
fix(auth): use <= for JWT expiry comparison
```

```
feat(pool): add connection timeout and idle eviction

Prevents exhaustion under bursty load; idle clients held >30s
were keeping connections open past db-side timeout.
```

```
refactor!: remove legacy callback API

BREAKING CHANGE: all async functions now return Promise only.
Callbacks removed. Migrate: fn(cb) → await fn()
```

## Wykonanie

1. Sprawdź `git diff --staged` (lub weź diff z kontekstu).
2. Napisz commit message w bloku kodu.
3. Nie wykonuj `git commit`. Nie staguj. Nie zmieniaj plików.
