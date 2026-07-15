"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repo = path.resolve(__dirname, "..");
const skillPath = path.join(repo, "skills", "krux-horda", "SKILL.md");
const roles = new Map([
  ["Niuch", ["debug", "root cause", "zwiad"]],
  ["Grom", ["backend", "API", "dane"]],
  ["Piryt", ["review", "ryzyko"]],
  ["Ochra", ["frontend", "UI"]],
  ["Młot", ["test", "weryfik"]],
  ["Lont", ["usuw", "refaktor"]]
]);

function body(markdown) {
  return markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/u, "").trim();
}

test("Horda is one concise on-demand map for native subagents", () => {
  const markdown = fs.readFileSync(skillPath, "utf8");
  const text = body(markdown);
  assert.match(markdown, /description: Use when /u);
  assert.ok(text.split(/\s+/u).length <= 150);
  assert.match(text, /specjalizac|izolacj|równoleg/u);
  assert.match(text, /drobnic/iu);
  assert.match(text, /natywnego subagenta/u);
  assert.match(text, /wynik, pliki, testy albo luka/u);
  for (const [name, markers] of roles) {
    assert.match(text, new RegExp(name, "u"));
    for (const marker of markers) assert.match(text, new RegExp(marker, "iu"));
  }
});

test("Horda has six logical roles and no always-loaded custom agents", () => {
  const markdown = fs.readFileSync(skillPath, "utf8");
  const listedRoles = [...body(markdown).matchAll(/^- ([^\s—]+) —/gmu)]
    .map((match) => match[1]);
  assert.deepEqual(listedRoles, [...roles.keys()]);
  assert.equal(fs.existsSync(path.join(repo, "agents")), false);
});
