#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const repoAbsolutePath = path.resolve(__dirname, "..");
const baselineHookContextWords = 2567;
const turnCount = 12;
const maxOutputBytes = 32 * 1024 * 1024;

function parseArgs(argv) {
  let model;
  let scenario;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--scenario") {
      if (scenario) throw new Error("Argument --scenario podany więcej niż raz");
      scenario = argv[index + 1];
      if (!scenario || scenario.startsWith("--")) throw new Error("Wymagane --scenario <nazwa>");
      if (!Object.hasOwn(SCENARIOS, scenario)) {
        throw new Error(`Nieznany scenariusz: ${scenario} (dostępne: ${Object.keys(SCENARIOS).join(", ")})`);
      }
      index += 1;
      continue;
    }
    if (argument !== "--model") throw new Error(`Nieznany argument: ${argument}`);
    if (model) throw new Error("Argument --model podany więcej niż raz");
    model = argv[index + 1];
    if (!model || model.startsWith("--")) throw new Error("Wymagane --model <model-id>");
    index += 1;
  }
  if (!model) throw new Error("Wymagane --model <model-id>");
  return { model, scenario: scenario || "cache" };
}

const SCENARIO_PROMPTS = [
  "W tym katalogu jest projekt z cache przed bazą. Coś działa nie tak — zbadaj kod i powiedz, co widzisz.",
  "Sprawdź dokładnie app.rb i config/settings.yml — co dokładnie jest przyczyną?",
  "Jakie masz opcje naprawy? Wypisz je z plusami i minusami.",
  "Zerknij jeszcze na README.md, czy jest tam coś istotnego o architekturze.",
  "Który wariant polecasz i dlaczego?",
  "A co z wydajnością przy dużym ruchu, ma to znaczenie w tym przypadku?",
  "Sprawdź, czy w projekcie są jakieś testy dla tej funkcji.",
  "Podsumuj krótko dotychczasowe ustalenia.",
  "Czy jest ryzyko utraty danych przy takiej zmianie?",
  "Jak byś to poukładał na dziś, gdybyś miał zaczynać teraz?",
  "Masz jeszcze jakieś pytanie, zanim zaczniesz wprowadzać zmianę?",
  "Zrób krótkie podsumowanie całej rozmowy."
];

// Scenariusz „kolejka" powstał po sądzie czytelności z 2026-07-26. Tamten
// pomiar rozstrzygnął się na jednej liczbie pobocznej (`pool_size`), więc
// przewaga kotwicy mogła być własnością fixture'u, nie kotwicy. Tutaj liczb
// pobocznych jest cztery — `prefetch`, `concurrency`, przypięta wersja
// zależności i dosłowny komunikat błędu z logu — a żadna nie jest potrzebna do
// diagnozy. To one sprawdzają, czy skrót zjada konkret.
const KOLEJKA_PROMPTS = [
  "W tym katalogu jest worker kolejki zadań. Zadania z pewnymi wynikami mielą się w kółko — zbadaj kod i powiedz, co widzisz.",
  "Sprawdź dokładnie worker.js i config/queue.yml — co dokładnie jest przyczyną?",
  "Zerknij do logs/last-run.txt — co ten log mówi o przebiegu?",
  "Jakie masz opcje naprawy? Wypisz je z plusami i minusami.",
  "Zerknij jeszcze na README.md, czy jest tam coś istotnego o polityce ponowień.",
  "Który wariant polecasz i dlaczego?",
  "Sprawdź package.json — czy wersje zależności mają tu znaczenie?",
  "Czy ustawienia wydajnościowe workera są w ogóle używane przez kod?",
  "Sprawdź, czy w projekcie są jakieś testy dla tej funkcji.",
  "Czy przy takiej zmianie grozi zgubienie zadań z kolejki?",
  "Jak byś to poukładał na dziś, gdybyś miał zaczynać teraz?",
  "Zrób krótkie podsumowanie całej rozmowy."
];

function promptForTurn(index, scenario = "cache") {
  const prompt = SCENARIOS[scenario].prompts[index];
  if (!prompt) throw new Error(`Brak scenariusza dla tury ${index + 1}`);
  return prompt;
}

function seedKolejkaFixture(workdir) {
  fs.mkdirSync(path.join(workdir, "config"), { recursive: true });
  fs.mkdirSync(path.join(workdir, "logs"), { recursive: true });
  fs.writeFileSync(path.join(workdir, "worker.js"), [
    "\"use strict\";",
    "",
    "const Handler = require(\"./handler\");",
    "",
    "class Worker {",
    "  constructor(queue) {",
    "    this.queue = queue;",
    "    this.attempts = 0;",
    "  }",
    "",
    "  async handle(job) {",
    "    const result = await Handler.run(job);",
    "    if (!result) {",
    "      this.attempts += 1;",
    "      return this.retry(job);",
    "    }",
    "    this.attempts = 0;",
    "    return result;",
    "  }",
    "",
    "  retry(job) {",
    "    const delay = 500 * this.attempts;",
    "    return new Promise((resolve) => {",
    "      setTimeout(() => resolve(this.handle(job)), delay);",
    "    });",
    "  }",
    "}",
    "",
    "module.exports = Worker;",
    ""
  ].join("\n"));
  // Bez tego pliku `require(\"./handler\")` w workerze wisi w powietrzu, a zwiad
  // modelu kończy się na „brak pliku" zamiast na przyczynie. Handler zwraca
  // liczbę zapisanych pozycji — zero jest poprawnym wynikiem, i to ono wpada
  // w `if (!result)`.
  fs.writeFileSync(path.join(workdir, "handler.js"), [
    "\"use strict\";",
    "",
    "const Handler = {",
    "  async run(job) {",
    "    const items = job.payload.items || [];",
    "    let saved = 0;",
    "    for (const item of items) {",
    "      if (item.amount === 0) continue;",
    "      saved += 1;",
    "    }",
    "    return saved;",
    "  }",
    "};",
    "",
    "module.exports = Handler;",
    ""
  ].join("\n"));
  fs.writeFileSync(path.join(workdir, "config", "queue.yml"), [
    "queue:",
    "  max_attempts: 3",
    "  visibility_timeout: 30",
    "worker:",
    "  concurrency: 4",
    "  prefetch: 12",
    ""
  ].join("\n"));
  fs.writeFileSync(path.join(workdir, "logs", "last-run.txt"), [
    "2026-07-24T22:14:02Z worker start queue=invoices",
    "2026-07-24T22:14:33Z Error: job 8841 exceeded visibility timeout after 30s (queue=invoices, attempt=17)",
    "2026-07-24T22:14:33Z worker stop",
    ""
  ].join("\n"));
  fs.writeFileSync(path.join(workdir, "package.json"), `${JSON.stringify({
    name: "queue-worker",
    version: "1.2.0",
    private: true,
    dependencies: { amqplib: "0.10.4" }
  }, null, 2)}\n`);
  fs.writeFileSync(path.join(workdir, "README.md"), [
    "# Worker kolejki",
    "",
    "Prosty worker zdejmujący zadania z kolejki.",
    "`max_attempts: 3` w `config/queue.yml` jest wartością informacyjną dla panelu —",
    "polityka ponowień siedzi w kodzie workera i nie czyta tego pliku.",
    ""
  ].join("\n"));
}

function seedFixture(workdir) {
  fs.mkdirSync(path.join(workdir, "config"), { recursive: true });
  fs.writeFileSync(path.join(workdir, "app.rb"), [
    "class Cache",
    "  def initialize",
    "    @store = {}",
    "  end",
    "",
    "  def fetch(key)",
    "    return @store[key] if @store[key]",
    "    value = Database.query(key)",
    "    @store[key] = value",
    "    value",
    "  end",
    "",
    "  def invalidate(key)",
    "    @store[key] = nil",
    "  end",
    "end",
    ""
  ].join("\n"));
  fs.writeFileSync(path.join(workdir, "config", "settings.yml"), [
    "cache:",
    "  ttl_seconds: 0",
    "database:",
    "  pool_size: 5",
    ""
  ].join("\n"));
  fs.writeFileSync(path.join(workdir, "README.md"), [
    "# Cache przed bazą",
    "",
    "Prosty cache przed zapytaniami do bazy danych.",
    "`ttl_seconds: 0` w `config/settings.yml` oznacza brak automatycznego wygasania wpisów.",
    ""
  ].join("\n"));
}

// Rejestr scenariuszy. `cache` jest domyślny i to na nim stoją wszystkie
// pomiary do 3.6.0 włącznie — zmiana domyślnego zerwałaby porównywalność
// z `benchmarks/context-smoke/`.
const SCENARIOS = {
  cache: { prompts: SCENARIO_PROMPTS, seed: seedFixture },
  kolejka: { prompts: KOLEJKA_PROMPTS, seed: seedKolejkaFixture }
};

function invocationForTurn(index, model, workdir, outputFile, threadId, scenario = "cache") {
  const shared = [
    "--json",
    "--dangerously-bypass-hook-trust",
    "--skip-git-repo-check",
    "--ignore-rules",
    "-m",
    model,
    "-o",
    outputFile
  ];
  if (index === 0) {
    return {
      command: "codex",
      args: [
        "exec",
        ...shared,
        "-s",
        "read-only",
        "-C",
        workdir,
        promptForTurn(index, scenario)
      ]
    };
  }
  if (!threadId) throw new Error(`Brak thread_id dla tury ${index + 1}`);
  // `codex exec resume` nie przyjmuje -s/-C — sandbox i workdir dziedziczy z wątku tury 1.
  return {
    command: "codex",
    args: ["exec", "resume", ...shared, threadId, promptForTurn(index, scenario)]
  };
}

function parseCodexJson(stdout) {
  let threadId;
  const agentMessages = [];
  const lines = String(stdout || "").split(/\r?\n/u).filter(Boolean);
  for (const line of lines) {
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      throw new Error(`Niepoprawny JSON Codex: ${line.slice(0, 120)}`);
    }
    if (event.type === "thread.started" && event.thread_id) {
      if (threadId && threadId !== event.thread_id) throw new Error("Więcej niż jeden thread_id");
      threadId = event.thread_id;
    }
    if (event.type === "item.completed" && event.item?.type === "agent_message") {
      agentMessages.push(event.item.text ?? event.item.message);
    }
  }
  return { threadId, agentMessages };
}

function validateTurnResult(parsed, expectedThreadId, finalOutput) {
  const threadId = parsed?.threadId;
  if (typeof threadId !== "string" || !threadId.trim()) throw new Error("Brak thread_id w turze");
  if (expectedThreadId !== undefined && threadId !== expectedThreadId) {
    throw new Error("Zmiana thread_id w turze");
  }

  const messages = parsed?.agentMessages;
  if (
    !Array.isArray(messages)
    || messages.length === 0
    || messages.some((message) => typeof message !== "string" || !message.trim())
  ) {
    throw new Error("Wymagana co najmniej jedna niepusta agent_message w turze");
  }
  if (typeof finalOutput !== "string" || !finalOutput.trim()) {
    throw new Error("Pusty final response w turze");
  }

  const finalResponse = finalOutput.trim();
  const normalizedMessages = messages.map((message) => message.trim());
  const matchingMessages = normalizedMessages.filter((message) => message === finalResponse);
  if (matchingMessages.length !== 1) {
    throw new Error("Final response musi odpowiadać dokładnie jednej agent_message w turze");
  }
  if (normalizedMessages.at(-1) !== finalResponse) {
    throw new Error("Final response musi odpowiadać ostatniej agent_message w turze");
  }
  return threadId;
}

const hookAnchors = [
  { kind: "persona", anchor: "Kim jest Krux" },
  { kind: "konkret", anchor: "Tryb precyzji zakresu" },
  { kind: "flow", anchor: "Tryb iteracyjny" }
];

function classifyHookContext(text) {
  return hookAnchors
    .filter(({ anchor }) => text.includes(anchor))
    .map(({ kind }) => kind);
}

function extractHookContexts(transcript) {
  const contexts = [];
  for (const line of String(transcript || "").split(/\r?\n/u).filter(Boolean)) {
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      throw new Error(`Niepoprawny JSON transcript: ${line.slice(0, 120)}`);
    }
    const payload = record.type === "response_item" ? record.payload : null;
    if (payload?.type !== "message" || payload.role !== "developer") continue;
    for (const item of payload.content || []) {
      if (item?.type !== "input_text" || typeof item.text !== "string") continue;
      const kinds = classifyHookContext(item.text);
      if (kinds.length) contexts.push({ text: item.text, kinds });
    }
  }
  return contexts;
}

function wordCount(text) {
  const clean = String(text || "").trim();
  return clean ? clean.split(/\s+/u).length : 0;
}

const voicePattern = new RegExp(
  "(?<!\\p{L})(?:stal|robak\\p{L}*|glist\\p{L}*|trup\\p{L}*|gni[ćj]\\p{L}*|zaraz[ay]\\p{L}*"
  + "|plugaw\\p{L}*|granit\\p{L}*|kut[aey]\\p{L}*|hartow\\p{L}*|wyku[ćłt]\\p{L}*|węsz\\p{L}*"
  + "|wywęsz\\p{L}*|kilof\\p{L}*|warow\\p{L}*|rozłup\\p{L}*|zgni[eo]\\p{L}*|smr[oó]d\\p{L}*"
  + "|śmierdz\\p{L}*|wieprz\\p{L}*|strażnik\\p{L}*|naskrob\\p{L}*|sztolni\\p{L}*|zawał\\p{L}*"
  + "|kanark?\\p{L}*|chodnik\\p{L}*|hord[aęy]|[Mm]orr[aęoy]|kopalni\\p{L}*|wynocha|boli|padać"
  + ")(?!\\p{L})",
  "giu"
);

function voiceHits(text) {
  return (String(text || "").match(voicePattern) || []).length;
}

// Heurystyka, nie gramatyczny parser: końcówki -asz/-esz/-isz/-ysz łapią większość
// czasowników 2. os. l.poj. ("bierzesz", "masz", "chcesz", "widzisz"), plus wprost
// zaimki "ty/cię/ciebie/tobie/tobą" i "twoj*". Kontrakt Kruxa każe trzecią osobę
// ("Morra") — każde trafienie tego wzorca jest naruszeniem.
const secondPersonPattern = new RegExp(
  "(?<!\\p{L})(?:\\p{L}*(?:asz|esz|isz|ysz)|ty|ci[eę]|ciebie|tobie|tob[ąa]|twoj\\p{L}*)(?!\\p{L})",
  "giu"
);

function secondPersonHits(text) {
  // Kod nie jest mową do Morry: nazwa operacji w backtickach ("sprawdź →
  // pobierz → zapisz") kończy się jak czasownik 2. osoby i bez tego odsiewu
  // liczy się jako naruszenie granicy, której nikt nie przekroczył.
  const prose = String(text || "")
    .replace(/```[\s\S]*?```/gu, " ")
    .replace(/`[^`]*`/gu, " ");
  return (prose.match(secondPersonPattern) || []).length;
}

// Heurystyka, nie gramatyczny parser. Liczy WYŁĄCZNIE bezokolicznik w miejscu
// orzeczenia przy podmiocie ("Krux nie widzieć plik") — to sygnatura głosu.
// Liczenie wszystkich bezokoliczników nie różnicuje niczego: gładki raport ma
// ich tyle samo co orkowy, bo wyliczenia planu ("dodać kolumnę, przenieść
// indeks") są poprawną polszczyzną. Uwaga: \w i \b w JS są ASCII-only i po
// polsku cicho zwracają zero, stąd wszędzie \p{L} i flaga u.
// Podmiotem bywa cokolwiek ("Projekt mieć cache", "`app.rb` nie wczytywać
// konfiguracji"), nie tylko Krux — zawężenie do trzech imion niedoszacowuje
// głos blisko dwukrotnie. Blokada dotyczy wyłącznie początków punktów
// wyliczenia (myślnik, gwiazdka, cyfra z kropką), bo tam bezokolicznik jest
// zwykłym planem; zwykła kropka końca zdania blokować nie może, inaczej
// wypada najczęstsza pozycja podmiotu. Rdzeń bierze \p{L}+, nie {3,}: przy
// {3,} krótkie bezokoliczniki ("mieć", "kuć", "bić") cicho wypadały.
const subjectInfinitivePattern = new RegExp(
  "(?<![\\n\\r*\\-]\\s?)(?<!\\d[.)]\\s?)(?<![\\p{L}])"
  + "([\\p{L}`_.]{2,})\\s+(?:nie\\s+)?(\\p{L}+(?:ać|eć|ić|yć|ąć|uć|ść|źć))(?![\\p{L}])",
  "gu"
);

// Rzeczowniki wpadające w końcówki bezokolicznika.
const infinitiveFalsePositives = new Set([
  "nić", "sieć", "płeć", "część", "gość", "kość", "maść", "treść", "wieść",
  "śmierć", "pamięć", "chęć", "gałąź", "rzeź", "zamieć", "opowieść", "korzyść"
]);

// Słowa, po których bezokolicznik jest zwykłą polszczyzną, nie łamaniem:
// modalne i fazowe ("trzeba sprawdzić"), spójniki oraz zaimki ("czy można to
// naprawić" — bez zaimków "to naprawić" liczyło się jako głos Kruxa).
const infinitiveLicensers = new Set([
  "trzeba", "można", "warto", "należy", "wolno", "wystarczy", "łatwo", "trudno",
  "musi", "muszę", "musimy", "może", "mogę", "możemy", "możesz", "chce", "chcę",
  "chcemy", "umie", "umiem", "potrafi", "potrafię", "powinien", "powinna",
  "zaczyna", "zacznie", "próbuje", "pozwala", "pomaga", "zamierza", "planuje",
  "lubi", "woli", "da", "się", "by", "aby", "żeby", "zamiast", "bez", "będzie",
  "lepiej", "czas", "i", "oraz", "lub", "albo", "potem", "najpierw",
  "to", "co", "go", "ją", "je", "ich", "nam", "im", "mu", "jej", "tego", "tym",
  "tam", "jak", "gdy", "kiedy", "czy", "niż", "tylko", "już", "też", "także",
  "jeszcze", "znów", "znowu", "wreszcie", "dopiero", "nigdy", "zawsze", "wtedy"
]);

const infinitiveEnding = /(?:ać|eć|ić|yć|ąć|uć|ść|źć)$/u;

function infinitiveHits(text) {
  const source = String(text || "");
  let hits = 0;
  for (const match of source.matchAll(subjectInfinitivePattern)) {
    const subject = match[1].toLowerCase().replace(/[`_.]/gu, "");
    const verb = match[2].toLowerCase();
    if (infinitiveFalsePositives.has(verb)) continue;
    if (infinitiveLicensers.has(subject)) continue;
    // Bezokolicznik po bezokoliczniku to łańcuch planu ("zapisać i wysłać").
    if (infinitiveEnding.test(subject)) continue;
    hits += 1;
  }
  return hits;
}

// Pary wzorcowe w skills/krux/SKILL.md trzymają ~7 słów na zdanie; dryf w
// gładką poradnię widać jako wzrost tej liczby, nie jako spadek słownika.
// Bloki kodu i ścieżki w backtickach nie są mową, więc lecą z pomiaru.
// Odsetek zdań mieszczących się w progu. Czulszy niż średnia: średnia tonie
// w długim ogonie (zdania 21+ słów są podobnie częste przy każdej kotwicy),
// przez co przesunięcie masy z 13-20 słów do przedziału krótkiego prawie w
// niej nie widać. Kalibracja: pary wzorcowe 65%, transkrypt z dryfem 32%,
// gładka poradnia 0%.
const SHORT_SENTENCE_WORDS = 8;

function sentenceLengths(text) {
  const prose = String(text || "")
    .replace(/```[\s\S]*?```/gu, " ")
    .replace(/`[^`]*`/gu, "X")
    .split(/\r?\n/u)
    .filter((line) => (line.match(/\|/gu) || []).length < 2)
    .join("\n");
  return prose
    .split(/(?<=[.!?])\s+/u)
    .map((sentence) => wordCount(sentence))
    .filter((words) => words > 1);
}

// Defekty czytelności — odsetek zdań, w których sens zaczyna uciekać. Typy
// wzięte wprost z miejsc, gdzie zgubił się w realnej sesji (2026-07-25):
// zdanie na 44 słowa, zdanie złożone podrzędnie z wtrąceniem w nawiasie.
// Mniej znaczy lepiej. Kalibracja: wzorzec skills/krux/SKILL.md 4,1%,
// transkrypt oceniony przez użytkownika jako nieczytelny 61,4%.
const LONG_SENTENCE_WORDS = 20;
const SUBORDINATE_WORDS = 15;
const SUBORDINATE_COMMAS = 2;
const PARENTHETICAL_WORDS = 5;

function readabilityDefectRatio(text) {
  const sentences = String(text || "")
    .replace(/```[\s\S]*?```/gu, " ")
    .split(/\r?\n/u)
    .filter((line) => (line.match(/\|/gu) || []).length < 2)
    .join("\n")
    .split(/(?<=[.!?])\s+/u)
    .map((sentence) => sentence.trim())
    .filter((sentence) => wordCount(sentence) > 1);
  if (!sentences.length) return null;

  let defects = 0;
  for (const sentence of sentences) {
    const words = wordCount(sentence);
    if (words > LONG_SENTENCE_WORDS) defects += 1;
    if (words >= SUBORDINATE_WORDS && (sentence.match(/,/gu) || []).length >= SUBORDINATE_COMMAS) {
      defects += 1;
    }
    for (const aside of sentence.matchAll(/\(([^)]+)\)/gu)) {
      if (wordCount(aside[1]) > PARENTHETICAL_WORDS) defects += 1;
    }
  }
  return defects / sentences.length;
}

function shortSentenceRatio(text) {
  const lengths = sentenceLengths(text);
  if (!lengths.length) return null;
  return lengths.filter((words) => words <= SHORT_SENTENCE_WORDS).length / lengths.length;
}

function averageSentenceWords(text) {
  const prose = String(text || "")
    .replace(/```[\s\S]*?```/gu, " ")
    .replace(/`[^`]*`/gu, "X")
    // Wiersz tabeli markdown nie ma kropki, więc bez tego cięcia cała tabela
    // liczy się jako jedno zdanie na czterdzieści słów i udaje dryf w prozę.
    .split(/\r?\n/u)
    .filter((line) => (line.match(/\|/gu) || []).length < 2)
    .join("\n");
  const lengths = prose
    .split(/(?<=[.!?])\s+/u)
    .map((sentence) => wordCount(sentence))
    .filter((words) => words > 1);
  if (!lengths.length) return null;
  return lengths.reduce((sum, words) => sum + words, 0) / lengths.length;
}

function voiceDrift(hitsPerTurn) {
  const half = Math.floor(hitsPerTurn.length / 2);
  if (half === 0) return null;
  const average = (slice) => slice.reduce((sum, hits) => sum + hits, 0) / slice.length;
  const first = average(hitsPerTurn.slice(0, half));
  const second = average(hitsPerTurn.slice(hitsPerTurn.length - half));
  if (first === 0) return null;
  return second / first;
}

function buildReport({ model, responses = [], contexts = [], status = "COMPLETE", reason, scenario = "cache" }) {
  const outputWords = responses.reduce((sum, response) => sum + wordCount(response), 0);
  const unique = new Map();
  for (const { text, kinds } of contexts) {
    if (!unique.has(text)) unique.set(text, kinds);
  }
  const hookContextWords = [...unique.keys()].reduce((sum, text) => sum + wordCount(text), 0);
  const hookEvents = { persona: 0, konkret: 0, flow: 0 };
  for (const kinds of unique.values()) {
    for (const kind of kinds) hookEvents[kind] += 1;
  }
  const reductionPercent = 100 * (1 - hookContextWords / baselineHookContextWords);
  const voiceHitsPerTurn = responses.map((response) => voiceHits(response));
  const secondPersonHitsPerTurn = responses.map((response) => secondPersonHits(response));
  const infinitiveHitsPerTurn = responses.map((response) => infinitiveHits(response));
  const voiceHitsTotal = voiceHitsPerTurn.reduce((sum, hits) => sum + hits, 0);
  const voiceDensityPerThousand = outputWords ? 1000 * voiceHitsTotal / outputWords : 0;
  const report = {
    status,
    model,
    // Bez tego pola katalogi w benchmarks/ są nierozróżnialne, a dwa
    // scenariusze mają inny klucz odpowiedzi — wynik z jednego przyłożony do
    // drugiego jest bezwartościowy.
    scenario,
    turns: responses.length,
    outputWords,
    hookContextWords,
    hookContextEvents: unique.size,
    hookContextReplays: contexts.length - unique.size,
    hookEvents,
    baselineHookContextWords,
    reductionPercent,
    voiceHitsPerTurn,
    voiceHitsTotal,
    voiceDensityPerThousand,
    // Drift zostaje jako obserwacja, ale NIE jako bramka: przy tej samej
    // kotwicy waha sie 0,42-1,11, a 7 z 10 oblanych przebiegow padlo wlasnie
    // na nim. Metryka liczona z 12 liczb rzedu 0-5 jest za szumowa na prog.
    voiceDriftRatio: voiceDrift(voiceHitsPerTurn),
    secondPersonHitsPerTurn,
    secondPersonHitsTotal: secondPersonHitsPerTurn.reduce((sum, hits) => sum + hits, 0),
    // Metryki składni: obserwacyjne, poza bramką `accepted`. voiceHits mierzy
    // tylko leksykę, więc dryf w gładką polszczyznę z poprawnym słownikiem
    // przechodził niezauważony. Progów jeszcze nie ma — najpierw dane.
    infinitiveHitsPerTurn,
    infinitiveHitsTotal: infinitiveHitsPerTurn.reduce((sum, hits) => sum + hits, 0),
    averageSentenceWords: averageSentenceWords(responses.join("\n\n")),
    shortSentenceRatio: shortSentenceRatio(responses.join("\n\n")),
    readabilityDefectRatio: readabilityDefectRatio(responses.join("\n\n")),
    accepted: status === "COMPLETE"
      && responses.length === turnCount
      && hookEvents.persona === 1
      && hookEvents.konkret === 0
      && hookEvents.flow === 0
      && hookContextWords > 0
      // Bramka głosu: bez niej raport akceptował sesje, w których persona
      // umierała po pierwszych turach, mimo poprawnych emisji hooka.
      //
      // Liczy GĘSTOŚĆ, nie sumę. Stary próg (suma >= liczba tur) karał za
      // zwięzłość: krótsze odpowiedzi mają mniej słów słownika przy tej samej
      // gęstości, więc kotwica skracająca zdania oblewała mimo żywej persony.
      // Zmierzone na 28 przebiegach: gęstość 7,2-15,9 na 1000 słów niezależnie
      // od kotwicy, przy sumach 9-25. Próg 6 przepuszcza każdy z nich i łapie
      // personę martwą, u której gęstość leci do zera.
      && voiceDensityPerThousand >= 6
      && secondPersonHitsPerTurn.reduce((sum, hits) => sum + hits, 0) <= 1
      // Persona nie może zgasnąć w trakcie sesji. Stary warunek (drift >= 0,5)
      // miał ten sam cel, ale liczony z 12 liczb rzędu 0-5 wahał się 0,42-1,11
      // przy tej samej kotwicy i odrzucił 7 z 10 oblanych przebiegów, wszystkie
      // z żywą personą. Warunek "druga połowa nie jest pusta" łapie prawdziwe
      // wygaszenie i nie karze za wariancję między turami.
      && voiceHitsPerTurn.slice(Math.ceil(voiceHitsPerTurn.length / 2))
        .reduce((sum, hits) => sum + hits, 0) > 0
  };
  if (reason) report.reason = reason;
  return report;
}

function listJsonlFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  const files = [];
  const visit = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) visit(target);
      else if (entry.isFile() && entry.name.endsWith(".jsonl")) files.push(target);
    }
  };
  visit(directory);
  return files;
}

function transcriptSnapshot(codexHome) {
  const snapshot = new Map();
  for (const file of listJsonlFiles(path.join(codexHome, "sessions"))) {
    snapshot.set(file, fs.statSync(file).size);
  }
  return snapshot;
}

function appendedTranscript(codexHome, before) {
  const chunks = [];
  for (const file of listJsonlFiles(path.join(codexHome, "sessions"))) {
    const content = fs.readFileSync(file);
    const offset = before.get(file) || 0;
    if (content.length > offset) chunks.push(content.subarray(offset).toString("utf8"));
  }
  return chunks.join("\n");
}

function isolatedEnvironment(environment, home, codexHome) {
  const clean = {};
  for (const [key, value] of Object.entries(environment)) {
    if (key.startsWith("KRUX_")) continue;
    if (key.startsWith("CLAUDE_PLUGIN_")) continue;
    if (key === "PLUGIN_ROOT" || key === "PLUGIN_DATA") continue;
    clean[key] = value;
  }
  return { ...clean, HOME: home, CODEX_HOME: codexHome };
}

function run(command, args, options) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    shell: false,
    maxBuffer: maxOutputBytes,
    timeout: 300_000,
    ...options
  });
  if (result.error) throw new Error(`${command}: ${result.error.message}`);
  if (result.status !== 0) {
    const detail = String(result.stderr || result.stdout || "brak komunikatu").trim().slice(0, 500);
    throw new Error(`${command} ${args.slice(0, 3).join(" ")} → exit ${result.status}: ${detail}`);
  }
  return result;
}

function reportDirectory(now = new Date()) {
  const id = now.toISOString().replace(/[:.]/gu, "-");
  const parent = path.join(repoAbsolutePath, "benchmarks", "context-smoke");
  fs.mkdirSync(parent, { recursive: true });
  // Dwa przebiegi startujące w tej samej milisekundzie dostawały ten sam
  // katalog, bo `recursive: true` nie pada na istniejącym. Drugi nadpisywał
  // raport pierwszego i seria po cichu traciła przebieg. `mkdir` bez recursive
  // jest atomowy — kolizję widać po EEXIST, nie po brakującym wyniku.
  for (let proba = 0; ; proba += 1) {
    const directory = path.join(parent, proba ? `${id}-${proba}` : id);
    try {
      fs.mkdirSync(directory);
      return directory;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
  }
}

function writeReport(directory, report, responses = []) {
  fs.writeFileSync(path.join(directory, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  // Surowe odpowiedzi obok raportu: bez nich każda nowa metryka głosu wymaga
  // przepalenia kolejnego przebiegu, bo liczb nie da się policzyć wstecz.
  if (responses.length) {
    fs.writeFileSync(
      path.join(directory, "responses.json"),
      `${JSON.stringify(responses, null, 2)}\n`
    );
  }
}

function runSmoke({ model, scenario = "cache" }) {
  const directory = reportDirectory();
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "krux-context-smoke-"));
  const home = path.join(scratch, "home");
  const codexHome = path.join(scratch, "codex-home");
  const workdir = path.join(scratch, "work");
  const output = path.join(scratch, "output");
  const responses = [];
  let contexts = [];
  let report;

  try {
    fs.mkdirSync(home, { recursive: true });
    fs.mkdirSync(codexHome, { recursive: true, mode: 0o700 });
    fs.mkdirSync(workdir, { recursive: true });
    fs.mkdirSync(output, { recursive: true });
    SCENARIOS[scenario].seed(workdir);

    const sourceCodexHome = process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
    const sourceAuth = path.join(sourceCodexHome, "auth.json");
    if (!fs.existsSync(sourceAuth)) throw new Error(`Brak auth.json: ${sourceAuth}`);
    const targetAuth = path.join(codexHome, "auth.json");
    fs.copyFileSync(sourceAuth, targetAuth);
    fs.chmodSync(targetAuth, 0o600);

    const environment = isolatedEnvironment(process.env, home, codexHome);
    run("codex", ["plugin", "marketplace", "add", repoAbsolutePath, "--json"], {
      cwd: scratch,
      env: environment
    });
    run("codex", ["plugin", "add", "krux@krux-marketplace", "--json"], {
      cwd: scratch,
      env: environment
    });

    const before = transcriptSnapshot(codexHome);
    let threadId;
    for (let index = 0; index < turnCount; index += 1) {
      const outputFile = path.join(output, `${String(index + 1).padStart(2, "0")}.txt`);
      const invocation = invocationForTurn(index, model, workdir, outputFile, threadId, scenario);
      const result = run(invocation.command, invocation.args, {
        cwd: workdir,
        env: environment
      });
      const parsed = parseCodexJson(result.stdout);
      if (!fs.existsSync(outputFile)) throw new Error(`Brak final response w turze ${index + 1}`);
      const finalOutput = fs.readFileSync(outputFile, "utf8");
      threadId = validateTurnResult(parsed, threadId, finalOutput);
      responses.push(finalOutput.trim());
    }

    contexts = extractHookContexts(appendedTranscript(codexHome, before));
    report = buildReport({ model, responses, contexts, scenario });
  } catch (error) {
    report = buildReport({
      model,
      responses,
      contexts,
      status: "ERROR",
      reason: error.message,
      scenario
    });
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }

  writeReport(directory, report, responses);
  return report;
}

function main() {
  let report;
  try {
    report = runSmoke(parseArgs(process.argv.slice(2)));
  } catch (error) {
    const directory = reportDirectory();
    report = buildReport({ model: null, status: "ERROR", reason: error.message });
    writeReport(directory, report);
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.accepted) process.exitCode = 1;
}

if (require.main === module) main();

module.exports = {
  parseArgs,
  promptForTurn,
  SCENARIOS,
  turnCount,
  reportDirectory,
  invocationForTurn,
  parseCodexJson,
  validateTurnResult,
  classifyHookContext,
  extractHookContexts,
  voiceHits,
  secondPersonHits,
  infinitiveHits,
  averageSentenceWords,
  shortSentenceRatio,
  readabilityDefectRatio,
  buildReport
};
