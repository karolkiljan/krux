"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const repo = path.resolve(__dirname, "..");
const readJson = (relative) => JSON.parse(fs.readFileSync(path.join(repo, relative), "utf8"));

function filesUnder(relative) {
  const root = path.join(repo, relative);
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const child = path.join(relative, entry.name);
    return entry.isDirectory() ? filesUnder(child) : [child];
  });
}

function trackedFilesUnder(relative) {
  const result = spawnSync("git", ["ls-files", "-z", "--", `${relative}/`], {
    cwd: repo,
    encoding: "utf8"
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout
    .split("\0")
    .filter(Boolean)
    .map((file) => path.relative(relative, file))
    .sort();
}

function body(markdown) {
  return markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/u, "").trim();
}

const codex = readJson(".codex-plugin/plugin.json");
const claude = readJson(".claude-plugin/plugin.json");
const marketplace = readJson(".claude-plugin/marketplace.json");
const pkg = readJson("package.json");
const hooks = readJson("hooks/hooks.json");

test("all distribution records expose the minimal 3.2.0 package", () => {
  assert.match(codex.version, /^3\.2\.0\+codex\.\d{14}$/u);
  assert.equal(claude.version, "3.2.0");
  assert.equal(marketplace.plugins[0].version, "3.2.0");
  assert.equal(pkg.version, "3.2.0");
  assert.equal(pkg.type, "commonjs");
  assert.equal(pkg.engines.node, ">=18");
  assert.deepEqual(pkg.dependencies ?? {}, {});
  assert.deepEqual(pkg.devDependencies ?? {}, {});
  assert.deepEqual(pkg.scripts, {
    test: "node --test",
    "smoke:context": "node scripts/context-smoke.js"
  });
});

test("Codex manifest uses default hook discovery and complete interface metadata", () => {
  assert.equal(Object.hasOwn(codex, "hooks"), false);
  assert.equal(codex.skills, "./skills/");
  assert.equal(codex.interface.displayName, "Krux");
  assert.equal(codex.interface.shortDescription, "Minimalna polska persona i sześciu specjalistów");
  assert.match(codex.interface.longDescription, /granicach kontekstu/u);
  assert.equal(codex.interface.developerName, "Karol Kiljan");
  assert.equal(codex.interface.category, "Developer Tools");
  assert.deepEqual(codex.interface.capabilities, ["Skills", "Hooks"]);
  assert.equal(codex.interface.websiteURL, "https://github.com/karolkiljan/krux");
  assert.deepEqual(codex.interface.defaultPrompt, [
    "$krux:krux — zastosuj głos Kruxa",
    "$krux:krux-horda — dobierz specjalistę"
  ]);
  assert.equal(codex.interface.brandColor, "#FF6B35");
});

test("hook registry has only two one-command lifecycle entries", () => {
  assert.deepEqual(Object.keys(hooks.hooks).sort(), ["SessionStart", "UserPromptSubmit"]);
  assert.equal(hooks.hooks.SessionStart[0].matcher, "startup|clear|compact");
  for (const entries of Object.values(hooks.hooks)) {
    assert.equal(entries.length, 1);
    assert.equal(entries[0].hooks.length, 1);
    const command = entries[0].hooks[0].command;
    assert.match(command, /hooks\/krux\.js/u);
    const target = command.match(/^node "([^"]+)"$/u)?.[1]
      .replace("${CLAUDE_PLUGIN_ROOT}", repo)
      .replace("${PLUGIN_ROOT}", repo);
    assert.ok(target && fs.existsSync(target), `missing hook target for ${command}`);
    const probe = spawnSync(process.execPath, [target], {
      cwd: repo,
      input: "{}",
      encoding: "utf8",
      timeout: 6_000
    });
    assert.equal(probe.status, 0, probe.stderr);
  }
});

test("runtime contains exactly four compact skills and no custom agents", () => {
  const skillDirs = fs.readdirSync(path.join(repo, "skills"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(skillDirs, ["krux", "krux-flow", "krux-horda", "krux-konkret"]);
  assert.equal(fs.existsSync(path.join(repo, "agents")), false);

  const horda = body(fs.readFileSync(path.join(repo, "skills", "krux-horda", "SKILL.md"), "utf8"));
  for (const role of ["Niuch", "Grom", "Piryt", "Ochra", "Młot", "Lont"]) {
    assert.match(horda, new RegExp(role, "u"));
  }
});

test("runtime keeps three state files and no legacy vocabulary", () => {
  const runtimeFiles = [...filesUnder("hooks"), ...filesUnder("skills")];
  assert.deepEqual(runtimeFiles.sort(), [
    "hooks/hooks.json",
    "hooks/krux.js",
    "skills/krux-flow/SKILL.md",
    "skills/krux-horda/SKILL.md",
    "skills/krux-konkret/SKILL.md",
    "skills/krux/SKILL.md"
  ]);
  const runtimeText = runtimeFiles.map((file) => fs.readFileSync(path.join(repo, file), "utf8")).join("\n");
  assert.deepEqual(
    [...new Set(runtimeText.match(/\.krux-[\w-]+/gu) || [])].sort(),
    [".krux-flow", ".krux-konkret", ".krux-mode"]
  );
  for (const forbidden of [
    "PostToolUse", "SubagentStart", "Stop", "KRUX_DRIFT", "statusline", "_common.md",
    "triggers.json", "Mordor", "Moria", "Sauron",
    "Tolkien", "Warcraft", "Warhammer"
  ]) {
    assert.doesNotMatch(runtimeText, new RegExp(forbidden, "iu"));
  }
});

test("all obsolete runtime paths are absent", () => {
  const obsolete = [
    "hooks/activate.js",
    "hooks/krux-flow-toggle.js",
    "hooks/krux-horda-trigger.js",
    "hooks/krux-konkret-toggle.js",
    "hooks/krux-statusline.sh",
    "hooks/krux-toggle.js",
    "hooks/codex",
    "hooks/lib"
  ];
  for (const relative of obsolete) {
    assert.equal(fs.existsSync(path.join(repo, relative)), false, `${relative} still exists`);
  }
  assert.deepEqual(filesUnder("skills/krux"), ["skills/krux/SKILL.md"]);
});

test("public and maintainer docs describe only the minimal architecture", () => {
  const readme = fs.readFileSync(path.join(repo, "README.md"), "utf8");
  const maintainer = fs.readFileSync(path.join(repo, "CLAUDE.md"), "utf8");
  const design = fs.readFileSync(path.join(repo, "docs", "superpowers", "specs", "2026-07-15-minimal-krux-design.md"), "utf8");
  const plan = fs.readFileSync(path.join(repo, "docs", "superpowers", "plans", "2026-07-15-minimal-krux.md"), "utf8");
  for (const required of ["Claude Code", "Codex", "włącz krux", "wyłącz krux", "krux-horda", "Niuch", "Lont"]) {
    assert.match(readme, new RegExp(required, "u"));
  }
  for (const required of ["hooks/hooks.json", "hooks/krux.js", "SessionStart", "source=compact", ".krux-mode", "3.2.0"]) {
    assert.match(maintainer, new RegExp(required.replace(".", "\\."), "u"));
  }
  for (const validator of [
    "skill-creator/scripts/quick_validate.py skills/krux",
    "skill-creator/scripts/quick_validate.py skills/krux-horda",
    "plugin-creator/scripts/validate_plugin.py ."
  ]) {
    assert.ok(
      maintainer.includes(`uv run --with pyyaml python /Users/karolkiljan/.codex/skills/.system/${validator}`),
      `missing reproducible validator command: ${validator}`
    );
  }
  assert.doesNotMatch(
    `${maintainer}\n${design}\n${plan}`,
    /^python3 .*\/(?:quick_validate|validate_plugin)\.py(?: |$)/gmu
  );
  assert.match(plan, /one atomic source commit replaces the four intermediate task commits/u);
  assert.doesNotMatch(`${readme}\n${maintainer}`, /drift|PostToolUse|statusline|final guard|triggers\.json/iu);
});

test("only the focused tests, smoke runner and current design records remain", (t) => {
  const ignoredSpecDirectory = fs.mkdtempSync(
    path.join(repo, "docs", "superpowers", "specs", ".ignored-contract-probe-")
  );
  const ignoredSpec = path.join(ignoredSpecDirectory, "workspace-note.md");
  fs.writeFileSync(ignoredSpec, "ignored workspace note\n");
  t.after(() => fs.rmSync(ignoredSpecDirectory, { recursive: true, force: true }));

  assert.deepEqual(trackedFilesUnder("test"), [
    "contract.test.js", "hook.test.js", "horda.test.js"
  ]);
  assert.deepEqual(trackedFilesUnder("scripts"), ["context-smoke.js"]);
  assert.deepEqual(trackedFilesUnder("docs/superpowers/specs"), [
    "2026-07-15-krux-konkret-flow-design.md",
    "2026-07-15-minimal-krux-design.md",
    "2026-07-16-persona-kapsula-design.md"
  ]);
  assert.deepEqual(trackedFilesUnder("docs/superpowers/plans"), [
    "2026-07-15-krux-konkret-flow.md",
    "2026-07-15-minimal-krux.md"
  ]);
  assert.equal(fs.existsSync(path.join(repo, "agents")), false);
  const pkg = JSON.parse(fs.readFileSync(path.join(repo, "package.json"), "utf8"));
  assert.equal(pkg.scripts["smoke:context"], "node scripts/context-smoke.js");
  assert.equal(spawnSync("git", ["check-ignore", "-q", "benchmarks/context-smoke/probe/report.json"], {
    cwd: repo
  }).status, 0);
});

test("context smoke helpers enforce the 12-turn report contract", () => {
  const smoke = require(path.join(repo, "scripts", "context-smoke.js"));
  assert.throws(() => smoke.parseArgs([]), /--model/u);
  assert.throws(() => smoke.parseArgs(["--wat"]), /Nieznany argument/u);

  const first = smoke.invocationForTurn(0, "model-x", "/work", "/out/01.txt");
  const second = smoke.invocationForTurn(1, "model-x", "/work", "/out/02.txt", "thread-1");
  assert.equal(first.args[0], "exec");
  assert.equal(second.args[1], "resume");
  assert.ok(second.args.includes("thread-1"));
  assert.ok(first.args.includes("--dangerously-bypass-hook-trust"));
  assert.equal(first.args.includes("--ignore-user-config"), false);

  const parsed = smoke.parseCodexJson([
    JSON.stringify({ type: "thread.started", thread_id: "thread-1" }),
    JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "wynik" } })
  ].join("\n"));
  assert.equal(parsed.threadId, "thread-1");
  assert.deepEqual(parsed.agentMessages, ["wynik"]);

  const persona = "## Kim jest Krux\n\nKrux jest orkiem z Górniczej Doliny";
  const transcript = [
    { type: "response_item", payload: { type: "message", role: "developer", content: [{ type: "input_text", text: persona }] } },
    { type: "response_item", payload: { type: "message", role: "developer", content: [{ type: "input_text", text: "unrelated" }] } },
    { type: "response_item", payload: { type: "message", role: "developer", content: [{ type: "input_text", text: "wzmianka o pluginie Krux bez iniekcji" }] } }
  ].map(JSON.stringify).join("\n");
  assert.deepEqual(smoke.extractHookContexts(transcript), [{ text: persona, kinds: ["persona"] }]);
  assert.deepEqual(smoke.classifyHookContext("Tryb precyzji zakresu: tylko proszone"), ["konkret"]);
  assert.deepEqual(smoke.classifyHookContext("Tryb iteracyjny: jeden ruch"), ["flow"]);
  assert.deepEqual(smoke.classifyHookContext("zwykły tekst ze słowem Krux"), []);

  const personaContext = { text: Array.from({ length: 64 }, () => "x").join(" "), kinds: ["persona"] };
  const accepted = smoke.buildReport({
    model: "model-x",
    responses: Array.from({ length: 12 }, () => "robak gryzie beton"),
    contexts: [personaContext]
  });
  assert.equal(accepted.turns, 12);
  assert.equal(accepted.outputWords, 36);
  assert.equal(accepted.hookContextWords, 64);
  assert.equal(accepted.hookContextEvents, 1);
  assert.equal(accepted.hookContextReplays, 0);
  assert.deepEqual(accepted.hookEvents, { persona: 1, konkret: 0, flow: 0 });
  assert.equal(accepted.baselineHookContextWords, 2567);
  assert.deepEqual(accepted.voiceHitsPerTurn, Array.from({ length: 12 }, () => 1));
  assert.equal(accepted.voiceHitsTotal, 12);
  assert.equal(accepted.voiceDriftRatio, 1);
  assert.equal(accepted.accepted, true);

  const replayed = smoke.buildReport({
    model: "model-x",
    responses: Array.from({ length: 12 }, () => "ok"),
    contexts: [personaContext, personaContext]
  });
  assert.equal(replayed.hookContextEvents, 1);
  assert.equal(replayed.hookContextReplays, 1);
  assert.equal(replayed.hookContextWords, 64);
  assert.equal(replayed.accepted, true);

  const doubledPersona = smoke.buildReport({
    model: "model-x",
    responses: Array.from({ length: 12 }, () => "ok"),
    contexts: [personaContext, { text: "## Kim jest Krux — inna kopia", kinds: ["persona"] }]
  });
  assert.deepEqual(doubledPersona.hookEvents, { persona: 2, konkret: 0, flow: 0 });
  assert.equal(doubledPersona.accepted, false);

  const rejected = smoke.buildReport({
    model: "model-x",
    responses: Array.from({ length: 11 }, () => "ok"),
    contexts: [personaContext]
  });
  assert.equal(rejected.accepted, false);

  const disabledPlugin = smoke.buildReport({
    model: "model-x",
    responses: Array.from({ length: 12 }, () => "ok"),
    contexts: []
  });
  assert.equal(disabledPlugin.accepted, false);

  assert.equal(smoke.voiceHits("Robak siedzieć w pętli. Wykuć od nowa, sztolnia stara."), 3);
  assert.equal(smoke.voiceHits("instalacja pakietu stała się prosta"), 0);
});

test("context smoke validates every turn against JSONL and final output", () => {
  const smoke = require(path.join(repo, "scripts", "context-smoke.js"));
  const valid = {
    threadId: "thread-1",
    agentMessages: ["krótka odpowiedź"]
  };

  assert.equal(smoke.validateTurnResult(
    { ...valid, agentMessages: ["pracuję", "krótka odpowiedź"] },
    undefined,
    "krótka odpowiedź"
  ), "thread-1");
  assert.equal(smoke.validateTurnResult(valid, undefined, "  krótka odpowiedź\n"), "thread-1");
  assert.equal(smoke.validateTurnResult(valid, "thread-1", "krótka odpowiedź"), "thread-1");

  assert.throws(
    () => smoke.validateTurnResult({ ...valid, threadId: undefined }, undefined, "krótka odpowiedź"),
    /thread_id/u
  );
  assert.throws(
    () => smoke.validateTurnResult(valid, "thread-2", "krótka odpowiedź"),
    /Zmiana thread_id/u
  );
  assert.throws(
    () => smoke.validateTurnResult({ ...valid, agentMessages: [] }, undefined, "krótka odpowiedź"),
    /co najmniej jedna niepusta agent_message/u
  );
  assert.throws(
    () => smoke.validateTurnResult(
      { ...valid, agentMessages: ["krótka odpowiedź", "krótka odpowiedź"] },
      undefined,
      "krótka odpowiedź"
    ),
    /dokładnie jednej agent_message/u
  );
  assert.throws(
    () => smoke.validateTurnResult(
      { ...valid, agentMessages: ["krótka odpowiedź", "późniejszy postęp"] },
      undefined,
      "krótka odpowiedź"
    ),
    /ostatniej agent_message/u
  );
  assert.throws(
    () => smoke.validateTurnResult(
      { ...valid, agentMessages: ["", "krótka odpowiedź"] },
      undefined,
      "krótka odpowiedź"
    ),
    /co najmniej jedna niepusta agent_message/u
  );
  assert.throws(
    () => smoke.validateTurnResult(valid, undefined, "  \n"),
    /Pusty final response/u
  );
  assert.throws(
    () => smoke.validateTurnResult(valid, undefined, "inna odpowiedź"),
    /dokładnie jednej agent_message/u
  );
});

test("context smoke preserves invalid agent messages for turn validation", () => {
  const smoke = require(path.join(repo, "scripts", "context-smoke.js"));
  const parsed = smoke.parseCodexJson([
    JSON.stringify({ type: "thread.started", thread_id: "thread-1" }),
    JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "" } }),
    JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "final" } })
  ].join("\n"));

  assert.deepEqual(parsed.agentMessages, ["", "final"]);
  assert.throws(
    () => smoke.validateTurnResult(parsed, undefined, "final"),
    /co najmniej jedna niepusta agent_message/u
  );
  for (const invalid of [null, 42]) {
    assert.throws(
      () => smoke.validateTurnResult(
        { threadId: "thread-1", agentMessages: [invalid, "final"] },
        undefined,
        "final"
      ),
      /co najmniej jedna niepusta agent_message/u
    );
  }
});
