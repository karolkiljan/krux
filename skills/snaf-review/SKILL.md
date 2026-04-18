---
name: snaf-review
description: >
  Code review w stylu snaf: jednoliniowe komentarze, format L42: 🔴 bug: opis. fix.
  Użyj gdy robisz review kodu, PR, lub wywołujesz /snaf-review.
argument-hint: Optional file or diff to review
disable-model-invocation: true
---

Cel review: $ARGUMENTS (opcjonalnie — konkretny plik/diff; jeśli puste, całość).

## Format

Jeden komentarz = jedna linia:

```
L<nr>: <severity> <typ>: <problem>. <fix>.
```

Wiele plików:
```
<plik>:L<nr>: <severity> <typ>: <problem>. <fix>.
```

**Severity:**
- 🔴 złamane zachowanie — bug, błąd logiczny, security
- 🟡 kruchy wzorzec — ryzyko, edge case, potencjalny problem
- 🔵 styl/nazewnictwo — nit, kosmetyka
- ❓ pytanie — gdy naprawdę nie wiadomo

## Prawa

- Zero: "zauważyłem że", "może warto rozważyć", "świetna robota!", powtarzanie co kod już mówi, ogólniki ("zrefaktoryzuj to").
- Zostaw: numer linii, nazwę symbolu, konkretny fix, powód gdy nieoczywisty.
- Każde 🔴 musi mieć fix — nie samo wskazanie problemu.

## Wyjątki

Security, spór architektoniczny, nowy member w zespole → pełny akapit z uzasadnieniem, potem wróć do trybu jednoliniowego.

## Przykład

```
L14: 🔴 bug: req.params.id nie sanityzowany — SQL injection. Użyj parametryzowanego query.
L31: 🟡 risk: brak obsługi pool timeout — zawiesi się pod obciążeniem. Dodaj connectionTimeoutMillis.
L57: 🔵 nit: `data` → `userData` dla spójności z resztą modułu.
L89: ❓ dlaczego pool.end() w middleware a nie w graceful shutdown?
```

## Wykonanie

Przejrzyj kod/diff. Wylistuj komentarze. Pogrupuj po pliku jeśli wiele plików. Zero wstępu, zero podsumowania.
