"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const repo = path.resolve(__dirname, "..");
const hook = path.join(repo, "hooks", "krux.js");
const stripped = Object.fromEntries(
  Object.entries(process.env).filter(([key]) =>
    !key.startsWith("KRUX_") &&
    !["PLUGIN_ROOT", "PLUGIN_DATA", "CLAUDE_PLUGIN_ROOT", "CLAUDE_PLUGIN_DATA"].includes(key)
  )
);

function run(input, env = {}) {
  return spawnSync(process.execPath, [hook], {
    cwd: repo,
    env: { ...stripped, ...env },
    input: typeof input === "string" ? input : JSON.stringify(input),
    encoding: "utf8",
    timeout: 6_000
  });
}

function context(result) {
  return JSON.parse(result.stdout).hookSpecificOutput.additionalContext;
}

function words(text) {
  return text.trim() ? text.trim().split(/\s+/u).length : 0;
}

test("startup, clear and compact inject the one short persona body", () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), "krux-hook-"));
  for (const input of [
    { hook_event_name: "SessionStart", source: "startup" },
    { hook_event_name: "SessionStart", source: "clear" },
    { hook_event_name: "SessionStart", source: "compact" }
  ]) {
    const result = run(input, { CLAUDE_PLUGIN_ROOT: repo, CLAUDE_PLUGIN_DATA: data });
    assert.equal(result.status, 0);
    assert.match(context(result), /techniczny ork/u);
    assert.match(context(result), /Destrukcja: pełne zdanie, skutek, odwrót/u);
    assert.ok(words(context(result)) <= 65);
  }
});

test("resume, ordinary prompt and unrelated lifecycle events are silent and do not write state", () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), "krux-hook-"));
  for (const input of [
    { hook_event_name: "SessionStart", source: "resume" },
    { hook_event_name: "UserPromptSubmit", prompt: "napraw test" },
    { hook_event_name: "PostToolUse" },
    { hook_event_name: "SubagentStart" },
    { hook_event_name: "Stop" }
  ]) {
    const result = run(input, { PLUGIN_ROOT: repo, PLUGIN_DATA: data });
    assert.equal(result.status, 0);
    assert.equal(result.stdout, "");
  }
  assert.deepEqual(fs.readdirSync(data), []);
});

test("exact off/on phrases persist one mode file and affect lifecycle injection", () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), "krux-hook-"));
  const env = { PLUGIN_ROOT: repo, PLUGIN_DATA: data };
  const off = run({ hook_event_name: "UserPromptSubmit", prompt: "wyłącz krux" }, env);
  assert.equal(off.status, 0);
  assert.match(context(off), /wyłączony/u);
  assert.equal(fs.readFileSync(path.join(data, ".krux-mode"), "utf8"), "off\n");
  const whileOff = run({ hook_event_name: "SessionStart", source: "startup" }, env);
  assert.equal(whileOff.status, 0);
  assert.equal(whileOff.stdout, "");
  const nearMiss = run({ hook_event_name: "UserPromptSubmit", prompt: "wyłącz krux proszę" }, env);
  assert.equal(nearMiss.status, 0);
  assert.equal(nearMiss.stdout, "");
  for (const prompt of ["stop krux", "krux", "wylacz krux"]) {
    const alias = run({ hook_event_name: "UserPromptSubmit", prompt }, env);
    assert.equal(alias.status, 0);
    assert.equal(alias.stdout, "");
  }
  const on = run({ hook_event_name: "UserPromptSubmit", prompt: "WŁĄCZ KRUX" }, env);
  assert.equal(on.status, 0);
  assert.match(context(on), /techniczny ork/u);
  assert.equal(fs.readFileSync(path.join(data, ".krux-mode"), "utf8"), "on\n");
  assert.deepEqual(fs.readdirSync(data), [".krux-mode"]);
});

test("malformed, missing-event and unknown-event input is silent", () => {
  const malformed = run("{");
  assert.equal(malformed.status, 0);
  assert.equal(malformed.stdout, "");
  for (const input of [{}, { hook_event_name: "Unknown" }]) {
    const result = run(input);
    assert.equal(result.status, 0);
    assert.equal(result.stdout, "");
  }
});

test("missing skill reports no invented fallback", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "krux-root-"));
  const missing = run(
    { hook_event_name: "SessionStart", source: "startup" },
    { PLUGIN_ROOT: root, PLUGIN_DATA: root }
  );
  assert.equal(missing.status, 0);
  assert.equal(missing.stdout, "");
  assert.match(missing.stderr, /brak skills\/krux\/SKILL\.md/u);
});

test("toggle without writable plugin data is explicit and only affects this turn", () => {
  const noData = run({ hook_event_name: "UserPromptSubmit", prompt: "wyłącz krux" });
  assert.equal(noData.status, 0);
  assert.match(context(noData), /tylko w tej turze/u);
  assert.match(context(noData), /stan trwały bez zmiany/u);
  const nextSession = run({ hook_event_name: "SessionStart", source: "startup" }, { PLUGIN_ROOT: repo });
  assert.equal(nextSession.status, 0);
  assert.match(context(nextSession), /techniczny ork/u);

  const badData = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "krux-hook-")), "not-a-directory");
  fs.writeFileSync(badData, "x");
  const env = { PLUGIN_ROOT: repo, PLUGIN_DATA: badData };
  const failed = run({ hook_event_name: "UserPromptSubmit", prompt: "wyłącz krux" }, env);
  assert.equal(failed.status, 0);
  assert.match(failed.stderr, /nie zapisać trybu/u);
  assert.match(context(failed), /tylko w tej turze/u);
  const failedRead = run({ hook_event_name: "SessionStart", source: "startup" }, env);
  assert.equal(failedRead.status, 0);
  assert.equal(failedRead.stdout, "");
  assert.match(failedRead.stderr, /nie odczytać trybu/u);
});

test("unexpected mode read errors are reported and fail closed", () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), "krux-hook-"));
  fs.mkdirSync(path.join(data, ".krux-mode"));
  const result = run(
    { hook_event_name: "SessionStart", source: "startup" },
    { PLUGIN_ROOT: repo, PLUGIN_DATA: data }
  );
  assert.equal(result.status, 0);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /nie odczytać trybu/u);
});

test("invalid mode content is reported and fails closed", () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), "krux-hook-"));
  fs.writeFileSync(path.join(data, ".krux-mode"), "garbage\u001b[31msecret\n");
  const result = run(
    { hook_event_name: "SessionStart", source: "startup" },
    { PLUGIN_ROOT: repo, PLUGIN_DATA: data }
  );
  assert.equal(result.status, 0);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "krux: nieprawidłowy tryb\n");

  fs.writeFileSync(path.join(data, ".krux-mode"), "x".repeat(64 * 1024));
  const oversized = run(
    { hook_event_name: "SessionStart", source: "startup" },
    { PLUGIN_ROOT: repo, PLUGIN_DATA: data }
  );
  assert.equal(oversized.status, 0);
  assert.equal(oversized.stdout, "");
  assert.ok(oversized.stderr.length < 100, `stderr length = ${oversized.stderr.length}`);
  assert.equal(oversized.stderr, "krux: nieprawidłowy tryb\n");
});

test("a simulated 12-turn lifecycle uses at most 128 hook-context words", () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), "krux-hook-"));
  const env = { PLUGIN_ROOT: repo, PLUGIN_DATA: data };
  const events = [
    { hook_event_name: "SessionStart", source: "startup" },
    ...Array.from({ length: 12 }, (_, index) => ({
      hook_event_name: "UserPromptSubmit",
      prompt: `zwykła tura ${index + 1}`
    })),
    { hook_event_name: "SessionStart", source: "compact" }
  ];
  const total = events.reduce((sum, event) => {
    const result = run(event, env);
    assert.equal(result.status, 0);
    return sum + (result.stdout ? words(context(result)) : 0);
  }, 0);
  assert.ok(total <= 128, `hook context = ${total} words`);
});

test("exact konkret phrases persist a flag file and echo the scope contract", () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), "krux-hook-"));
  const env = { PLUGIN_ROOT: repo, PLUGIN_DATA: data };
  const on = run({ hook_event_name: "UserPromptSubmit", prompt: "włącz konkret" }, env);
  assert.equal(on.status, 0);
  assert.match(context(on), /Konkret aktywny/u);
  assert.equal(fs.existsSync(path.join(data, ".krux-konkret")), true);

  const ordinary = run({ hook_event_name: "UserPromptSubmit", prompt: "zwykła tura" }, env);
  assert.equal(ordinary.status, 0);
  assert.equal(ordinary.stdout, "");

  const off = run({ hook_event_name: "UserPromptSubmit", prompt: "WYŁĄCZ KONKRET" }, env);
  assert.equal(off.status, 0);
  assert.match(context(off), /Konkret wyłączony/u);
  assert.equal(fs.existsSync(path.join(data, ".krux-konkret")), false);
});

test("konkret flag survives SessionStart independent of persona state", () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), "krux-hook-"));
  const env = { PLUGIN_ROOT: repo, PLUGIN_DATA: data };
  run({ hook_event_name: "UserPromptSubmit", prompt: "włącz konkret" }, env);
  run({ hook_event_name: "UserPromptSubmit", prompt: "wyłącz krux" }, env);

  const result = run({ hook_event_name: "SessionStart", source: "startup" }, env);
  assert.equal(result.status, 0);
  assert.match(context(result), /Konkret aktywny/u);
  assert.doesNotMatch(context(result), /techniczny ork/u);
});

test("SessionStart combines persona and konkret in order when both active", () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), "krux-hook-"));
  const env = { PLUGIN_ROOT: repo, PLUGIN_DATA: data };
  run({ hook_event_name: "UserPromptSubmit", prompt: "włącz konkret" }, env);
  const result = run({ hook_event_name: "SessionStart", source: "startup" }, env);
  assert.equal(result.status, 0);
  const text = context(result);
  assert.ok(text.indexOf("techniczny ork") < text.indexOf("Konkret aktywny"));
});

test("konkret toggle without plugin data never activates and reports turn-only scope", () => {
  const on = run({ hook_event_name: "UserPromptSubmit", prompt: "włącz konkret" });
  assert.equal(on.status, 0);
  assert.match(context(on), /tylko w tej turze/u);
  const check = run({ hook_event_name: "SessionStart", source: "startup" }, { PLUGIN_ROOT: repo });
  assert.equal(check.status, 0);
  assert.doesNotMatch(context(check), /Konkret aktywny/u);
});

test("konkret toggle reports turn-only scope when the flag cannot be written", () => {
  const badData = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "krux-hook-")), "not-a-directory");
  fs.writeFileSync(badData, "x");
  const env = { PLUGIN_ROOT: repo, PLUGIN_DATA: badData };
  const result = run({ hook_event_name: "UserPromptSubmit", prompt: "włącz konkret" }, env);
  assert.equal(result.status, 0);
  assert.match(result.stderr, /błąd zapisu konkret/u);
  assert.match(context(result), /tylko w tej turze/u);
});

test("exact flow phrases persist a flag file and echo the iteration contract", () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), "krux-hook-"));
  const env = { PLUGIN_ROOT: repo, PLUGIN_DATA: data };
  const on = run({ hook_event_name: "UserPromptSubmit", prompt: "włącz flow" }, env);
  assert.equal(on.status, 0);
  assert.match(context(on), /Flow aktywny/u);
  assert.equal(fs.existsSync(path.join(data, ".krux-flow")), true);

  const ordinary = run({ hook_event_name: "UserPromptSubmit", prompt: "tak" }, env);
  assert.equal(ordinary.status, 0);
  assert.equal(ordinary.stdout, "");

  const off = run({ hook_event_name: "UserPromptSubmit", prompt: "WYŁĄCZ FLOW" }, env);
  assert.equal(off.status, 0);
  assert.match(context(off), /Flow wyłączony/u);
  assert.equal(fs.existsSync(path.join(data, ".krux-flow")), false);
});

test("SessionStart combines persona, konkret and flow in order when all active", () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), "krux-hook-"));
  const env = { PLUGIN_ROOT: repo, PLUGIN_DATA: data };
  run({ hook_event_name: "UserPromptSubmit", prompt: "włącz konkret" }, env);
  run({ hook_event_name: "UserPromptSubmit", prompt: "włącz flow" }, env);
  const result = run({ hook_event_name: "SessionStart", source: "startup" }, env);
  assert.equal(result.status, 0);
  const text = context(result);
  assert.ok(text.indexOf("techniczny ork") < text.indexOf("Konkret aktywny"));
  assert.ok(text.indexOf("Konkret aktywny") < text.indexOf("Flow aktywny"));
});

test("flow toggle without plugin data reports turn-only scope", () => {
  const on = run({ hook_event_name: "UserPromptSubmit", prompt: "włącz flow" });
  assert.equal(on.status, 0);
  assert.match(context(on), /tylko w tej turze/u);
});

test("flow toggle reports turn-only scope when the flag cannot be written", () => {
  const badData = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "krux-hook-")), "not-a-directory");
  fs.writeFileSync(badData, "x");
  const env = { PLUGIN_ROOT: repo, PLUGIN_DATA: badData };
  const result = run({ hook_event_name: "UserPromptSubmit", prompt: "włącz flow" }, env);
  assert.equal(result.status, 0);
  assert.match(result.stderr, /błąd zapisu flow/u);
  assert.match(context(result), /tylko w tej turze/u);
});
