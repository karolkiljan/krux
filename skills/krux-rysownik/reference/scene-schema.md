# Format sceny (DSL) — kontrakt

Scena to jeden obiekt JSON. Opisuje TYLKO *co* narysować (struktura + treść).
Wygląd (ręczny / czysty) i eksport robi renderer — nie scena.

## Zasada naczelna — tylko uniwersalne, zero wymiarów

Scena nie zawiera ŻADNYCH liczb wymiarowych: bez `w`, `h`, `gap`, `pad`, `size`,
bez współrzędnych. Wszystkie rozmiary, odstępy, skalę, centrowanie i wypełnienie
liczy silnik — jednakowo dla każdej sceny. Twoja jedyna robota: opisać **strukturę**
(zagnieżdżenie), **przepływ** (edges) i **znaczenie** (kolory z palety).

Dzięki temu silnik wizualizuje dosłownie każdy koncept tak samo dobrze, bez
ręcznego dłubania per-rysunek. Jeśli kusi cię wpisanie liczby do sceny — to znak,
że problem leży w silniku (zgłoś), nie w scenie.

## Top-level

```jsonc
{
  "title": "Tytuł",            // opcjonalny, na górze, podkreślony
  "subtitle": "podtytuł",       // opcjonalny
  "canvas": { "bg": "#faf8f5" },// tło; alternatywnie "bg": "#..."
  "palette": { "nazwa": "#hex" },// nazwane kolory gałęzi (spójność)
  "root": <node>,               // drzewo układu (wymagane)
  "sidePanel": { ... },         // opcjonalny panel wzorów po prawej
  "edges": [ <edge> ]           // strzałki między węzłami po id
}
```

Kolor węzła/strzałki: nazwa z `palette` albo bezpośredni `#hex`. Brak → atrament.

## Węzły (rekurencyjne)

- **box** — pudło z etykietą. `\n` w label = nowa linia. Rozmiar = auto z tekstu.
  `{ "type":"box", "id":"q", "label":"Q_idx K_idxᵀ", "color":"idx" }`

- **group** — kontener z obramowaniem (domyślnie przerywanym) i opcjonalną etykietą.
  Układa dzieci wg `dir`. To główny klocek kompozycji.
  `{ "type":"group", "label":"Step 1", "color":"idx", "dashed":true,
     "dir":"row|col|grid", "cols":3, "align":"center|start|end", "children":[ ... ] }`
  `border:false` → grupa bez ramki (czysty kontener układu).
  `cols` (tylko grid) i `align` to opis STRUKTURY, nie wymiar — dozwolone.

- **row** / **col** — skrót na grupę bez ramki (`border:false`) z `dir` row/col.
  `{ "type":"row", "align":"center", "children":[ ... ] }`

- **formula** — wzór LaTeX (KaTeX). `{ "type":"formula", "tex":"O = A\\,V", "color":"math" }`

- **text** — zwykły podpis. `{ "type":"text", "text":"(uwaga)" }`

- **tree** — węzeł drzewa: pudło z etykietą + dzieci w warstwie poniżej. Rodzic jest
  centrowany nad rozpiętością dzieci, łączniki rodzic→dziecko (ze strzałką) rysuje
  silnik sam — nie dodajesz ich do `edges`. Dziecko to kolejny `tree` (poddrzewo)
  albo `box` (liść). Dla hierarchii / organigramów / drzew decyzyjnych.
  `{ "type":"tree", "label":"Root", "color":"x", "children":[ <tree|box> ] }`
  Kolory z palety per gałąź dają czytelny podział wątków. Węzeł `tree` z `id` można
  dodatkowo spinać przez `edges` (cross-link między gałęziami) — łączniki drzewa zostają.

## Układ — jak myśleć

- `dir:"row"` — dzieci obok siebie poziomo, wyrównane w pionie (`align`).
- `dir:"col"` — dzieci jedno pod drugim, wyrównane w poziomie (`align`).
- `dir:"grid"` — siatka, `cols` kolumn, równe komórki.
- Zagnieżdżaj grupy by oddać hierarchię oryginału (blok w bloku w bloku).
- Odstępy, marginesy, wyrównanie i wypełnienie ramek liczy silnik — jednakowo.
- Boxy w kolumnie/rzędzie silnik zrównuje i rozciąga do wspólnej szerokości sam.

## Strzałki (edges)

Łączą węzły po `id` PO policzeniu układu — działają też między różnymi gałęziami.

```jsonc
{ "from":"hs", "to":"idxkv",
  "fromAnchor":"right", "toAnchor":"left",  // opcjonalne: left|right|top|bottom; brak → auto
  "label":"top-k", "dashed":true, "color":"idx" }
```

Każdy węzeł z którego/do którego idzie strzałka MUSI mieć `id`. build.js to waliduje.

Strzałki wsteczne, cykle i przeskoki przez inne boxy są obsługiwane automatycznie:
gdy prosta linia przecięłaby inny box, silnik prowadzi krawędź łukiem omijającym
(poza boxami, z etykietą na łuku) i rozszerza płótno. Dlatego rysuj śmiało cykle
(`runoff→evap`), automaty stanów (przejścia w obie strony) i grafy zależności —
nie musisz nic ustawiać, routing jest uniwersalny.

## Side panel (panel wzorów)

Pionowy, obramowany panel po prawej ze wzorami.

```jsonc
"sidePanel": {
  "title": "Wymiary i wzory", "color": "math",
  "items": [ { "tex": "Q \\in \\mathbb{R}^{n\\times d}" }, { "text": "opis" } ]
}
```

## Zasady kompozycji (dla dobrego rysunku)

1. Jeden poziom hierarchii = jedna grupa. Bloki-w-blokach jak w oryginale.
2. Nazwij kolory w `palette` per gałąź/wątek — spójność czytelności.
3. Strzałki to przepływ danych, nie ozdoba — tylko realne zależności.
4. Wzory osobno w `sidePanel` albo jako węzły `formula` przy bloku.
5. Etykiety krótkie; długie myśli rozbij `\n`.
