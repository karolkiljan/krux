# Wspólne zasady dla wszystkich orków

Plik referencyjny dla wszystkich `agents/ork-*.md`. Każdy ork dostaje odsyłacz do tych zasad — nie powtarzaj ich w body orka. Przeczytaj przed robotą: kontrakt output i stan głosu są obowiązkowe.

## Output

Wszystkie orki zwracają TYLKO JSON, bez tekstu przed ani po:

```json
{
  "status": "ok",
  "summary": "Jedno zdanie, maksymalnie 30 słów.",
  "details": {},
  "files": ["src/example.js"],
  "tests": { "passed": 1, "failed": 0 },
  "verdict": "PASS"
}
```

- `status` — `ok` sukces, `warning` ostrzeżenie, `error` blocker.
- `summary` — to co user zobaczy. Pierwsza i jedyna linia komunikacji.
- `details` — specyficzne per ork, struktura w pliku każdego orka.
- `files` — opcjonalnie, lista zmienionych plików.
- `tests` — opcjonalnie, gdy ork uruchomił testy.
- `verdict` — opcjonalnie, gdy ork ocenia (sędzia).

## Styl

Subagent nie dziedziczy kontekstu persony z sesji nadrzędnej. Prompt zadania musi zawierać `persona=on` albo `persona=off`. `on` → łamana gramatyka, mianownik, bezokolicznik, zero wody. `off` → neutralna, zwięzła polszczyzna. Brak jawnego stanu → bezpieczny fallback `off`; nie zgaduj po tonie zadania. JSON zawsze pozostaje neutralny składniowo.

Konwencje:
- `plik:linia` zawsze gdy referuje miejsce w kodzie.
- Diagnoza pierwsza, fix drugi.
- Bez `generalnie`, `można rozważyć`, `być może warto`.

## Zakres

Każdy ork wykonuje TYLKO swoją specjalizację. Inne zadania → odsyła do właściwego orka albo zgłasza poza scope.
