"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  infinitiveHits,
  secondPersonHits,
  averageSentenceWords,
  shortSentenceRatio,
  readabilityDefectRatio,
  buildReport
} = require("../scripts/context-smoke.js");

// Heurystyki głosu są pisane po polsku, a klasy \w i \b w JS są ASCII-only.
// Wzorzec zbudowany na \w cicho zwraca zero na każdym polskim czasowniku —
// pomiar wygląda wtedy na "brak dryfu" zamiast na zepsute narzędzie.
test("polish letters survive the metric patterns", () => {
  assert.equal(infinitiveHits("Krux widzieć robaka."), 1);
  assert.equal(infinitiveHits("Krux nie mieć dostępu."), 1);
  assert.ok(averageSentenceWords("Zażółć gęślą jaźń teraz.") > 0);
});

test("infinitive metric counts the predicate slot, not every infinitive", () => {
  // Sygnatura głosu: bezokolicznik zamiast formy osobowej przy podmiocie.
  assert.equal(infinitiveHits("Krux nie widzieć plik. Ja szukać dalej."), 2);

  // Podmiotem bywa cokolwiek, nie tylko Krux — zawężenie do imion gubiłoby
  // najczęstszy kształt ("Projekt mieć cache", "`app.rb` nie wczytywać X").
  assert.equal(infinitiveHits("Projekt mieć cache. Robak siedzieć w pętli."), 2);

  // Plan w punktach to poprawna polszczyzna — nie liczy się jako łamanie.
  assert.equal(infinitiveHits("Plan:\n- dodać kolumnę signature\n- przenieść indeks"), 0);
  assert.equal(infinitiveHits("1. zapisać wynik\n2. uruchomić testy"), 0);

  // Modalne, fazowe i zaimki licencjonują bezokolicznik w gładkiej mowie.
  assert.equal(infinitiveHits("Krux może sprawdzić logi. Ja chcę zobaczyć wynik."), 0);
  assert.equal(infinitiveHits("Trzeba zweryfikować, czy można to naprawić bez restartu."), 0);
});

test("infinitive metric separates the voice pattern from a drifted transcript", () => {
  const wzorzec = "Krux nie widzieć plik. Krux wywęszyć trzy smrody. Ja szukać dalej czemu.";
  const dryf = "Krux sprawdzi konfigurację i zweryfikuje, czy problem leży w parametrze, "
    + "a następnie przygotuje poprawkę, którą trzeba będzie jeszcze przetestować.";
  assert.ok(
    infinitiveHits(wzorzec) > infinitiveHits(dryf),
    `wzorzec ${infinitiveHits(wzorzec)} powinien bić dryf ${infinitiveHits(dryf)}`
  );
  assert.equal(infinitiveHits(dryf), 0);
});

test("sentence length metric ignores code and tracks the drift into smooth prose", () => {
  const krotko = "Build pad. Robak siedzieć w pętli. Wyciągnąć na zewnątrz.";
  const dlugo = "Build się wysypał, ponieważ instrukcja return została umieszczona "
    + "wewnątrz pętli, przez co funkcja kończy działanie po pierwszej iteracji.";
  assert.ok(averageSentenceWords(krotko) < 6);
  assert.ok(averageSentenceWords(dlugo) > 15);

  // Bloki kodu i ścieżki nie są mową i nie mogą zaniżać ani zawyżać średniej.
  const zKodem = "Build pad.\n\n```\nconst x = 1;\nconst y = 2;\n```\n\nRobak siedzieć w pętli.";
  assert.equal(averageSentenceWords(zKodem), averageSentenceWords("Build pad. Robak siedzieć w pętli."));
  assert.equal(averageSentenceWords(""), null);

  // Wiersz tabeli nie ma kropki: bez odsiania cała tabela liczy się jako
  // jedno zdanie na kilkadziesiąt słów i podnosi średnią bez powodu.
  const zTabela = "Build pad.\n\n| opcja | zalety | wady |\n| --- | --- | --- |\n"
    + "| Redis | wspólny dla wielu procesów, natywny TTL, limity pamięci | nowa infrastruktura, koszt |\n\n"
    + "Robak siedzieć w pętli.";
  assert.equal(averageSentenceWords(zTabela), averageSentenceWords("Build pad. Robak siedzieć w pętli."));
});

test("short sentence ratio catches a shift the average hides", () => {
  // Ta sama średnia, inny rozkład: masa przesunięta z długich do krótkich.
  const krotkie = "Build pad. Robak siedzieć w pętli. Krux wykuć. "
    + "Instrukcja return została umieszczona wewnątrz pętli i kończy funkcję po pierwszej iteracji.";
  const dlugie = "Build pad wskutek błędu. "
    + "Instrukcja return została umieszczona wewnątrz pętli i kończy funkcję po pierwszej iteracji. "
    + "Konfiguracja nie jest nigdzie wczytywana, więc wartość progu nie ma żadnego znaczenia.";
  assert.ok(
    shortSentenceRatio(krotkie) > shortSentenceRatio(dlugie),
    `krótkie ${shortSentenceRatio(krotkie)} powinno bić długie ${shortSentenceRatio(dlugie)}`
  );

  assert.equal(shortSentenceRatio("Build pad. Robak siedzieć w pętli."), 1);
  assert.equal(shortSentenceRatio(""), null);

  // Ten sam odsiew struktur co przy średniej — kod i tabele nie są mową.
  const zTabela = "Build pad.\n\n| a | b |\n| --- | --- |\n| jeden dwa trzy | cztery pięć sześć |\n\nRobak siedzieć w pętli.";
  assert.equal(shortSentenceRatio(zTabela), 1);
});

test("readability defects catch the shapes where meaning escaped", () => {
  // Zdanie krotkie niesie pelna tresc — zero defektow.
  assert.equal(readabilityDefectRatio("Build pad. Robak siedziec w petli."), 0);

  // Zdanie na 20+ slow: rekord z realnej sesji mial 44.
  const dlugie = "Cache nie rozpoznawac zapisanych wartosci pustych ani brakujacych wpisow, "
    + "przez co baza dostawac zapytanie za kazdym razem i pula polaczen konczyc sie szybko.";
  assert.ok(readabilityDefectRatio(dlugie) > 0);

  // Wtracenie w nawiasie dluzsze niz piec slow rozrywa zdanie.
  const zWtraceniem = "Robak siedziec w petli (dokladnie ten sam wzorzec co w poprzednim module systemu) i psuc wynik.";
  assert.ok(readabilityDefectRatio(zWtraceniem) > 0);

  assert.equal(readabilityDefectRatio(""), null);

  // Kod i tabele nie sa mowa — ten sam odsiew co w pozostalych metrykach.
  const zKodem = "Build pad.\n\n```\nconst bardzo = 1; const dlugi = 2; const blok = 3;\n```\n\nRobak siedziec w petli.";
  assert.equal(readabilityDefectRatio(zKodem), 0);
});

test("second person metric ignores code identifiers", () => {
  // Zwrot do Morry to naruszenie granicy glosu.
  assert.equal(secondPersonHits("Czy widzisz ten plik?"), 1);
  assert.equal(secondPersonHits("To twoje commity."), 1);

  // Nazwa operacji w backtickach konczy sie jak czasownik 2. osoby, ale
  // nikt tu do nikogo nie mowi - kod nie jest mowa.
  assert.equal(secondPersonHits("Operacja `sprawdź → pobierz → zapisz` nie być atomowa."), 0);
  assert.equal(secondPersonHits("Blok:\n```\nzapisz(key)\n```\nRobak siedzieć dalej."), 0);
});

test("report carries the syntax metrics without touching the acceptance gate", () => {
  const responses = ["Krux nie widzieć plik. Morra czeka.", "Robak w sztolni. Krux wykuć."];
  const report = buildReport({ model: "probe", responses, contexts: [], status: "COMPLETE" });

  assert.equal(report.infinitiveHitsPerTurn.length, responses.length);
  assert.equal(
    report.infinitiveHitsTotal,
    report.infinitiveHitsPerTurn.reduce((sum, hits) => sum + hits, 0)
  );
  assert.ok(report.averageSentenceWords > 0);

  // Metryki są obserwacyjne: dopóki nie ma progów, nie mogą przesądzać wyniku.
  const gladki = responses.map(() => "Sprawdziłem konfigurację i przygotowałem poprawkę.");
  const gladkiReport = buildReport({ model: "probe", responses: gladki, contexts: [], status: "COMPLETE" });
  assert.equal(gladkiReport.infinitiveHitsTotal, 0);
  assert.equal(gladkiReport.accepted, false, "gładki raport i tak pada na bramce słownika, nie na składni");
});
