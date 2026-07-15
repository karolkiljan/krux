#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = process.env.CLAUDE_PLUGIN_ROOT || process.env.PLUGIN_ROOT || path.resolve(__dirname, "..");
const data = process.env.CLAUDE_PLUGIN_DATA || process.env.PLUGIN_DATA || "";
const modePath = data ? path.join(data, ".krux-mode") : "";

function readInput() {
  try {
    const raw = fs.readFileSync(0, "utf8");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function modeIsOn() {
  if (!modePath) return true;
  try {
    const descriptor = fs.openSync(modePath, "r");
    let mode = "";
    try {
      const buffer = Buffer.alloc(17);
      const length = fs.readSync(descriptor, buffer, 0, buffer.length, 0);
      if (length < buffer.length) mode = buffer.subarray(0, length).toString("utf8").trim();
    } finally {
      fs.closeSync(descriptor);
    }
    if (mode === "on") return true;
    if (mode === "off") return false;
    process.stderr.write("krux: nieprawidłowy tryb\n");
    return false;
  } catch (error) {
    if (error.code === "ENOENT") return true;
    process.stderr.write(`krux: nie odczytać trybu: ${error.message}\n`);
    return false;
  }
}

function writeMode(mode) {
  if (!modePath) return false;
  try {
    fs.mkdirSync(data, { recursive: true });
    fs.writeFileSync(modePath, `${mode}\n`);
    return true;
  } catch (error) {
    process.stderr.write(`krux: nie zapisać trybu: ${error.message}\n`);
    return false;
  }
}

function persona() {
  const skill = path.join(root, "skills", "krux", "SKILL.md");
  try {
    return fs.readFileSync(skill, "utf8")
      .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/u, "")
      .trim();
  } catch {
    process.stderr.write("krux: brak skills/krux/SKILL.md\n");
    return "";
  }
}

function emit(event, additionalContext) {
  if (!additionalContext) return;
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: event, additionalContext }
  }));
}

const input = readInput();
if (!input || typeof input.hook_event_name !== "string") process.exit(0);

const event = input.hook_event_name;
if (event === "SessionStart") {
  if (!["startup", "clear", "compact"].includes(input.source) || !modeIsOn()) process.exit(0);
  emit(event, persona());
} else if (event === "UserPromptSubmit") {
  const prompt = typeof input.prompt === "string" ? input.prompt.trim() : "";
  if (/^wyłącz krux$/iu.test(prompt)) {
    const saved = writeMode("off");
    emit(event, saved
      ? "Tryb Krux wyłączony. Odpowiadaj neutralnie."
      : "Tryb Krux wyłączony tylko w tej turze; stan trwały bez zmiany. Odpowiadaj neutralnie.");
  } else if (/^włącz krux$/iu.test(prompt)) {
    const saved = writeMode("on");
    const voice = persona();
    emit(event, saved ? voice : `Tryb Krux włączony tylko w tej turze; stan trwały bez zmiany.\n${voice}`.trim());
  }
}
