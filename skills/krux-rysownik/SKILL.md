---
name: krux-rysownik
description: Use when the user wants to visually explain or teach a topic as a hand-drawn style diagram (boxes, arrows, dashed group containers, side formula panel) like an Excalidraw/whiteboard sketch. Triggers on Polish "narysuj/zwizualizuj/wytłumacz na schemacie/diagram/rysunek wyjaśniający" or English "draw/visualize/diagram this concept". Composes a scene from primitives and renders it in hand-drawn or clean style with PNG/SVG/.excalidraw export.
argument-hint: temat do narysowania
---

# rysownik — wizualne tłumaczenie tematu

Bierze TEMAT, tłumaczy go z własnej wiedzy i kuje odręczny schemat: kolorowe
pudła, strzałki, zagnieżdżone przerywane ramki-grupy, boczny panel ze wzorami,
tytuł — w stylu tablicy / Excalidraw.

## Kiedy używać

- User mówi „narysuj / zwizualizuj / wytłumacz na schemacie / zrób diagram X".
- Temat techniczny/koncepcyjny, który zyskuje na obrazie (architektura, przepływ,
  pipeline, mechanizm, hierarchia).
- Wejście to TEMAT (wiedza Claude'a). Nie ma parsowania zewnętrznych źródeł.

## Jak to działa (3 warstwy)

1. **Scena (JSON)** — *co* narysować. To piszesz Ty. Kontrakt: `reference/scene-schema.md`.
2. **Renderer** (`template/rysownik.html`) — *jak* wygląda. Silnik układu w
   przeglądarce + rough.js / czysty SVG + KaTeX. Przyciski na stronie:
   styl (Ręczny/Czysty) i eksport (PNG/SVG/.excalidraw).
3. **build.js** — wstrzykuje scenę w renderer → samodzielny plik HTML.

Styl i format wyniku user przełącza PRZYCISKAMI na gotowej stronie — dlatego
zwykle NIE musisz pytać o styl z góry; budujesz raz, user klika resztę.

## Flow runtime

1. **Zrozum temat.** Wydobądź z promptu temat i poziom (przegląd vs szczegół).
   Niejasny temat → jedno pytanie doprecyzowujące, potem rysuj.
2. **Rozłóż wiedzę na strukturę.** Wypisz w głowie: bloki/etapy, gałęzie,
   przepływ danych (co → co), kluczowe wzory. To szkielet sceny.
3. **Skomponuj scenę** wg `reference/scene-schema.md`:
   - hierarchia = zagnieżdżone `group` (dir row/col/grid),
   - przepływ = `edges` po `id`,
   - matematyka = `sidePanel` lub węzły `formula`,
   - kolory per gałąź w `palette`.
   Wzoruj się na `reference/examples/sparse-attention.json` (bogaty) i
   `simple-flow.json` (prosty).
4. **Zapisz scenę** do pliku, np. `<temat>.scene.json` (w katalogu roboczym usera
   albo /tmp jeśli nie wskazano).
5. **Zbuduj:** użyj `scripts/build.js` z KATALOGU TEGO SKILLA (przy wczytaniu
   podany jako „Base directory for this skill" — globalnie `~/.claude/skills/krux-rysownik`,
   w pluginie ścieżka instalacji Kruxa). build.js sam znajduje template względem siebie.
   ```bash
   node "<BASE_DIR>/scripts/build.js" <scena>.json --out <temat>.html
   ```
   build.js waliduje scenę (spójność id w edges) i wypisuje ścieżkę pliku.
6. **Oddaj userowi** ścieżkę do `.html`. Powiedz: otwórz w przeglądarce; na górze
   przełączasz styl (Ręczny/Czysty/Mermaid) i klikasz eksport (PNG / SVG /
   .excalidraw).

Opcjonalnie `--style hand|clean` ustawia styl startowy (domyślnie hand).

## Wybór stylu (kontekst dla usera)

- **Ręczny (rough.js)** — krzywa kreska + pismo odręczne. Domyślny, klimat tablicy.
- **Czysty (SVG)** — ostre pudła, font Inter. Do dokumentacji/slajdów.

## Eksport

- **PNG** — html2canvas, rasteryzuje całość (z KaTeX). Najpewniejszy.
- **SVG** — wektor; kształty + tekst, wzory jako foreignObject (best-effort).
- **.excalidraw** — edytowalna scena (excalidraw.com / rozszerzenie VS Code);
  wzory lądują jako tekst LaTeX.

## Wymagania / ograniczenia

- Potrzebny **Node.js** do `build.js` (Claude Code go dostarcza). Brak → patrz fallback.
- Wynik HTML ciągnie biblioteki z **CDN** (rough.js, KaTeX, html2canvas, font Caveat)
  → do oglądania trzeba internetu. Bez sieci pudła się narysują, ale bez fontu/wzorów.
- Eksport SVG z ciężką matematyką = best-effort.

## Fallback bez build.js

Jeśli Node nie działa: skopiuj `template/rysownik.html`, w kopii podmień
`/*__SCENE__*/ null` na `/*__SCENE__*/ <twój JSON>` i zapisz jako `.html`.
To jedyna zmiana, której wymaga szablon.

## Dobre nawyki

- **Zero wymiarów w scenie.** Nigdy nie wpisuj `w`/`h`/`gap`/`pad`/`size` ani
  współrzędnych — silnik liczy rozmiary, odstępy, skalę i centrowanie sam,
  jednakowo dla każdego konceptu. Opisujesz tylko strukturę, przepływ i kolory.
  Kusi cię liczba w scenie → to brak w silniku, nie w rysunku.
- Najpierw szkielet (bloki + przepływ), potem ozdoby (wzory, kolory).
- Strzałka = realna zależność danych, nie dekoracja.
- Etykiety krótkie, długie rozbijaj `\n`.
- Po zbudowaniu zachęć usera, by przełączył style i wybrał eksport — to jego decyzja.
