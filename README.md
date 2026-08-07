# Krux

Krux to plugin dla Claude Code i Codex. Daje asystentowi zwięzły polski głos technicznego orka i sześciu wyspecjalizowanych orków, którzy wchodzą do roboty wyłącznie na żądanie.

Pod spodem nic się nie zmienia: ta sama wiedza, ta sama poprawność. Zmienia się to, ile słów trzeba przeczytać, żeby dojść do sedna.

## Jak to brzmi

**Zwykły asystent**

> Build pada z `TypeError: Cannot read properties of undefined (reading 'map')` w `src/render.js:42` — pewnie `items` jest undefined.

**Krux**

> Build pad. Kompilator mówi — `TypeError: Cannot read properties of undefined (reading 'map')`, plik `src/render.js`, linia 42. Wygląda na to, że `items` undefined, bo API odesłało goniec z pustymi rękami.

Komunikat błędu, ścieżka i numer linii przechodzą co do znaku. Hipoteza dalej brzmi jak hipoteza. Głos siedzi na brzegach zdania, nigdy w faktach.

## Instalacja

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

Przełączniki działają, gdy stanowią całą wiadomość. Ustawienie jest trwałe — przeżywa restart sesji.

| Komenda | Skutek |
|---|---|
| `włącz krux` | głos orka |
| `wyłącz krux` | tryb neutralny |
| `włącz konkret` / `wyłącz konkret` | precyzja zakresu: tylko to, o co proszono, nic ponadto |
| `włącz flow` / `wyłącz flow` | rytm iteracyjny: jeden ruch na raz, zgoda przed każdym |

Trzy osie są niezależne i składalne — zakres i rytm nie zmieniają głosu ani siebie nawzajem.

## Horda

Sześciu specjalistów do zadań, które opłaca się oddać osobnemu agentowi. Mapa ładuje się na żądanie: w Claude Code przez `/krux:krux-horda`, w Codeksie przez `$krux:krux-horda`.

| Ork | Fach |
|---|---|
| Niuch | debug, szukanie przyczyny, zwiad po kodzie |
| Grom | backend, API, dane |
| Piryt | review i ocena ryzyka |
| Ochra | frontend i UI |
| Młot | testy i weryfikacja |
| Lont | bezpieczne usuwanie i refaktor |

Krux deleguje tylko przy fachowej specjalizacji, izolacji kontekstu albo realnej równoległości. Drobnicę robi sam — zimny subagent na jednego grepa kosztuje więcej, niż daje.

## Granice

Poprawność, bezpieczeństwo i wymagany format wyprzedzają głos. Liczby, wersje, ścieżki, komendy i komunikaty błędów idą dosłownie. Kod, JSON, commit messages i opisy PR pozostają neutralne — głos obowiązuje wokół nich, nie w środku. Przed ruchem nieodwracalnym Krux przechodzi na pełne zdania: warunek, skutek, droga odwrotu.

## Wymagania

- macOS albo Linux
- Claude Code albo Codex
- Node.js 18+ w `PATH`
- zero zależności runtime, bez `npm install`

```bash
npm test
```

## Licencja

MIT. Projekt nie jest powiązany z innymi produktami o nazwie Krux.
