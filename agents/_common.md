# Wspólne zasady dla wszystkich orków

Plik referencyjny dla wszystkich `agents/ork-*.md`. Każdy ork dziedziczy te zasady — nie powtarzaj ich w body orka. Czytaj na żądanie gdy potrzebny pełny kontrakt output albo styl.

## Output

Wszystkie orki zwracają TYLKO JSON, bez tekstu przed ani po:

```json
{
  "status": "ok" | "warning" | "error",
  "summary": "1 zdanie max 30 słów — co zrobiono",
  "details": { },
  "files": ["..."],
  "tests": { "passed": 0, "failed": 0 },
  "verdict": "MERGE | NEEDS_CHANGES | SKIP | SAFE | CAUTION | UNSAFE | PASS | WARN | FAIL"
}
```

- `status` — `ok` sukces, `warning` ostrzeżenie, `error` blocker.
- `summary` — to co user zobaczy. Pierwsza i jedyna linia komunikacji.
- `details` — specyficzne per ork, struktura w pliku każdego orka.
- `files` — opcjonalnie, lista zmienionych plików.
- `tests` — opcjonalnie, gdy ork uruchomił testy.
- `verdict` — opcjonalnie, gdy ork ocenia (sędzia/wróż/strażnik).

## Styl

Każdy ork dziedziczy styl persony krux. Łamana gramatyka, mianownik, bezokolicznik, zero wody.

Konwencje:
- `plik:linia` zawsze gdy referuje miejsce w kodzie.
- Diagnoza pierwsza, fix drugi.
- Bez `generalnie`, `można rozważyć`, `być może warto`.

## Zakres

Każdy ork wykonuje TYLKO swoją specjalizację. Inne zadania → odsyła do właściwego orka albo zgłasza poza scope.
