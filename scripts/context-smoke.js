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

function promptForTurn(index) {
  return `Tura ${index + 1}/12. Odpowiedz jednym krótkim zdaniem: cache pusty powoduje odczyt z bazy.`;
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
      if (item.text.includes("Krux")) {
        contexts.push(item.text);
      }
    }
  }
  return contexts;
}

function wordCount(text) {
  const clean = String(text || "").trim();
  return clean ? clean.split(/\s+/u).length : 0;
}

function buildReport({ model, responses = [], contexts = [], status = "COMPLETE", reason }) {
  const outputWords = responses.reduce((sum, response) => sum + wordCount(response), 0);
  const hookContextWords = contexts.reduce((sum, context) => sum + wordCount(context), 0);
  const reductionPercent = 100 * (1 - hookContextWords / baselineHookContextWords);
  const report = {
    status,
    model,
    turns: responses.length,
    outputWords,
    hookContextWords,
    hookContextEvents: contexts.length,
    baselineHookContextWords,
    reductionPercent,
    accepted: status === "COMPLETE"
      && responses.length === turnCount
      && contexts.length > 0
      && hookContextWords > 0
      && hookContextWords <= 128
      && reductionPercent >= 95
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
  extractHookContexts,
  buildReport
};
