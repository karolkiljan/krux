#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = process.env.CLAUDE_PLUGIN_ROOT || process.env.PLUGIN_ROOT || path.resolve(__dirname, "..");
const data = process.env.CLAUDE_PLUGIN_DATA || process.env.PLUGIN_DATA || "";
const modePath = data ? path.join(data, ".krux-mode") : "";
const konkretPath = data ? path.join(data, ".krux-konkret") : "";
const flowPath = data ? path.join(data, ".krux-flow") : "";
const VOICE_ANCHOR = `Krux pamiętać: Morra trzecią osobą, nigdy „ty" — jak „Krux nie widzieć plik", nie „nie widzę pliku"; pytanie do Morry brzmi „Morra chce X?", nie „chcesz X?". Gramatyka łamana, słownik żywy: robak, wykuć, sztolnia, smród, zawał.`;

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
  const temporary = `${modePath}.${process.pid}.tmp`;
  try {
    fs.mkdirSync(data, { recursive: true });
    fs.writeFileSync(temporary, `${mode}\n`);
    fs.renameSync(temporary, modePath);
    return true;
  } catch (error) {
    try {
      fs.rmSync(temporary, { force: true });
    } catch {}
    process.stderr.write(`krux: nie zapisać trybu: ${error.message}\n`);
    return false;
  }
}

function flagOn(filePath) {
  return Boolean(filePath) && fs.existsSync(filePath);
}

function setFlag(filePath, on, label) {
  if (!filePath) return false;
  try {
    if (on) {
      fs.mkdirSync(data, { recursive: true });
      fs.closeSync(fs.openSync(filePath, "w"));
    } else {
      fs.unlinkSync(filePath);
    }
    return true;
  } catch (error) {
    if (!on && error.code === "ENOENT") return true;
    process.stderr.write(`krux: błąd zapisu ${label}: ${error.message}\n`);
    return false;
  }
}

function skillBody(name) {
  const skill = path.join(root, "skills", name, "SKILL.md");
  try {
    return fs.readFileSync(skill, "utf8")
      .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/u, "")
      .trim();
  } catch {
    process.stderr.write(`krux: brak skills/${name}/SKILL.md\n`);
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
  if (!["startup", "clear", "compact"].includes(input.source)) process.exit(0);
  const parts = [];
  if (modeIsOn()) parts.push(skillBody("krux"));
  if (flagOn(konkretPath)) parts.push(skillBody("krux-konkret"));
  if (flagOn(flowPath)) parts.push(skillBody("krux-flow"));
  const combined = parts.filter(Boolean).join("\n\n");
  if (combined) emit(event, combined);
} else if (event === "UserPromptSubmit") {
  const prompt = typeof input.prompt === "string" ? input.prompt.normalize("NFC").trim() : "";
  if (/^wyłącz krux$/iu.test(prompt)) {
    const saved = writeMode("off");
    emit(event, saved
      ? "Tryb Krux wyłączony. Odpowiadaj neutralnie."
      : "Tryb Krux wyłączony tylko w tej turze; stan trwały bez zmiany. Odpowiadaj neutralnie.");
  } else if (/^włącz krux$/iu.test(prompt)) {
    const saved = writeMode("on");
    const voice = skillBody("krux");
    emit(event, saved
      ? (voice || "Tryb Krux włączony, ale body persony jest niedostępne.")
      : `Tryb Krux włączony tylko w tej turze; stan trwały bez zmiany.\n${voice}`.trim());
  } else if (/^wyłącz konkret$/iu.test(prompt)) {
    const saved = setFlag(konkretPath, false, "konkret");
    emit(event, saved ? "Konkret wyłączony." : "Konkret wyłączony tylko w tej turze.");
  } else if (/^włącz konkret$/iu.test(prompt)) {
    const saved = setFlag(konkretPath, true, "konkret");
    const contract = skillBody("krux-konkret");
    emit(event, saved
      ? (contract || "Konkret włączony, ale kontrakt jest niedostępny.")
      : `Konkret włączony tylko w tej turze; stan trwały bez zmiany.\n${contract}`.trim());
  } else if (/^wyłącz flow$/iu.test(prompt)) {
    const saved = setFlag(flowPath, false, "flow");
    emit(event, saved ? "Flow wyłączony." : "Flow wyłączony tylko w tej turze.");
  } else if (/^włącz flow$/iu.test(prompt)) {
    const saved = setFlag(flowPath, true, "flow");
    const contract = skillBody("krux-flow");
    emit(event, saved
      ? (contract || "Flow włączony, ale kontrakt jest niedostępny.")
      : `Flow włączony tylko w tej turze; stan trwały bez zmiany.\n${contract}`.trim());
  } else if (modeIsOn()) {
    emit(event, VOICE_ANCHOR);
  }
}
