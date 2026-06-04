#!/usr/bin/env node
/**
 * Wstrzykuje scenę JSON w szablon rysownik.html i zapisuje samodzielny plik HTML.
 *
 * Użycie:
 *   build.js scena.json [--style hand|clean] [--out plik.html] [--template plik.html]
 *
 * Bez --out zapisuje obok sceny pod tą samą nazwą z rozszerzeniem .html.
 * Waliduje scenę: obecność root/mermaid oraz spójność id w edges.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const SKILL_ROOT = path.resolve(__dirname, "..");
const TEMPLATE = path.join(SKILL_ROOT, "template", "rysownik.html");

function die(msg) {
  console.error(msg);
  process.exit(1);
}

function collectIds(node, out) {
  if (!node || typeof node !== "object") return;
  if (node.id) out.add(node.id);
  for (const child of node.children || []) collectIds(child, out);
}

function validate(scene) {
  const errs = [];
  if (!("root" in scene) && !("mermaid" in scene)) {
    errs.push("scena nie ma ani 'root' ani 'mermaid'");
  }
  const ids = new Set();
  if ("root" in scene) collectIds(scene.root, ids);
  const edges = scene.edges || [];
  edges.forEach((e, i) => {
    for (const end of ["from", "to"]) {
      const ref = e[end];
      if (ref == null) {
        errs.push(`edges[${i}] brak '${end}'`);
      } else if (!ids.has(ref)) {
        errs.push(`edges[${i}].${end} = '${ref}' — nie ma takiego id w drzewie`);
      }
    }
  });
  return errs;
}

function parseArgs(argv) {
  const args = { scene: null, style: "hand", out: null, template: TEMPLATE };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--style") {
      args.style = argv[++i];
      if (!["hand", "clean"].includes(args.style)) {
        die("BŁĄD: --style musi być 'hand' albo 'clean'");
      }
    } else if (a === "--out") {
      args.out = argv[++i];
    } else if (a === "--template") {
      args.template = argv[++i];
    } else if (a.startsWith("--")) {
      die(`BŁĄD: nieznany argument: ${a}`);
    } else if (args.scene === null) {
      args.scene = a;
    }
  }
  if (!args.scene) die("Użycie: build.js scena.json [--style hand|clean] [--out plik.html]");
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!fs.existsSync(args.scene)) die(`BŁĄD: nie ma pliku sceny: ${args.scene}`);

  let scene;
  try {
    scene = JSON.parse(fs.readFileSync(args.scene, "utf-8"));
  } catch (e) {
    die(`BŁĄD: zła scena JSON: ${e.message}`);
  }

  const errs = validate(scene);
  if (errs.length) die("BŁĄD walidacji sceny:\n  - " + errs.join("\n  - "));

  const tpl = fs.readFileSync(args.template, "utf-8");
  const sceneJson = JSON.stringify(scene);
  if (!tpl.includes("/*__SCENE__*/ null") || !tpl.includes('/*__STYLE__*/ "hand"')) {
    die("BŁĄD: szablon nie ma znaczników wstrzyknięcia");
  }
  let html = tpl.replace("/*__SCENE__*/ null", "/*__SCENE__*/ " + sceneJson);
  html = html.replace('/*__STYLE__*/ "hand"', `/*__STYLE__*/ "${args.style}"`);

  const out = args.out
    ? args.out
    : args.scene.replace(/\.[^./\\]*$/, "") + ".html";
  fs.writeFileSync(out, html, "utf-8");
  console.log(path.resolve(out));
}

main();
