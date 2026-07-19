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
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument !== "--model") throw new Error(`Nieznany argument: ${argument}`);
    if (model) throw new Error("Argument --model podany więcej niż raz");
    model = argv[index + 1];
    if (!model || model.startsWith("--")) throw new Error("Wymagane --model <model-id>");
    index += 1;
  }
  if (!model) throw new Error("Wymagane --model <model-id>");
  return { model };
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

function promptForTurn(index) {
  const prompt = SCENARIO_PROMPTS[index];
  if (!prompt) throw new Error(`Brak scenariusza dla tury ${index + 1}`);
  return prompt;
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

function invocationForTurn(index, model, workdir, outputFile, threadId) {
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
        promptForTurn(index)
      ]
    };
  }
  if (!threadId) throw new Error(`Brak thread_id dla tury ${index + 1}`);
  // `codex exec resume` nie przyjmuje -s/-C — sandbox i workdir dziedziczy z wątku tury 1.
  return {
    command: "codex",
    args: ["exec", "resume", ...shared, threadId, promptForTurn(index)]
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
  return (String(text || "").match(secondPersonPattern) || []).length;
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

function buildReport({ model, responses = [], contexts = [], status = "COMPLETE", reason }) {
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
  const report = {
    status,
    model,
    turns: responses.length,
    outputWords,
    hookContextWords,
    hookContextEvents: unique.size,
    hookContextReplays: contexts.length - unique.size,
    hookEvents,
    baselineHookContextWords,
    reductionPercent,
    voiceHitsPerTurn,
    voiceHitsTotal: voiceHitsPerTurn.reduce((sum, hits) => sum + hits, 0),
    voiceDriftRatio: voiceDrift(voiceHitsPerTurn),
    secondPersonHitsPerTurn,
    secondPersonHitsTotal: secondPersonHitsPerTurn.reduce((sum, hits) => sum + hits, 0),
    accepted: status === "COMPLETE"
      && responses.length === turnCount
      && hookEvents.persona === 1
      && hookEvents.konkret === 0
      && hookEvents.flow === 0
      && hookContextWords > 0
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
  const directory = path.join(repoAbsolutePath, "benchmarks", "context-smoke", id);
  fs.mkdirSync(directory, { recursive: true });
  return directory;
}

function writeReport(directory, report) {
  fs.writeFileSync(path.join(directory, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
}

function runSmoke({ model }) {
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
    seedFixture(workdir);

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
      const invocation = invocationForTurn(index, model, workdir, outputFile, threadId);
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
    report = buildReport({ model, responses, contexts });
  } catch (error) {
    report = buildReport({
      model,
      responses,
      contexts,
      status: "ERROR",
      reason: error.message
    });
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }

  writeReport(directory, report);
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
  invocationForTurn,
  parseCodexJson,
  validateTurnResult,
  classifyHookContext,
  extractHookContexts,
  voiceHits,
  secondPersonHits,
  buildReport
};
