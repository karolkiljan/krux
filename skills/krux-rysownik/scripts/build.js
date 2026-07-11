#!/usr/bin/env node
/**
 * Wstrzykuje scenę JSON w szablon rysownik.html i zapisuje samodzielny plik HTML.
 *
 * Użycie:
 *   build.js scena.json [--style hand|clean] [--out plik.html]
 *
 * Bez --out zapisuje obok sceny pod tą samą nazwą z rozszerzeniem .html.
 * Waliduje scenę: obecność root, poprawność typów/dir, unikalność id, spójność id w edges.
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

const VALID_TYPES = new Set(["box", "group", "row", "col", "formula", "text", "tree"]);
const VALID_DIRS = new Set(["row", "col", "grid"]);

function collectIds(node, out) {
  if (!node || typeof node !== "object") return;
  if (node.id) {
    if (out.has(node.id)) {
      // duplikat — caller zgłosi błąd walidacji
      out.__dupes = out.__dupes || new Set();
      out.__dupes.add(node.id);
    } else {
      out.add(node.id);
    }
  }
  if (Array.isArray(node.children)) for (const child of node.children) collectIds(child, out);
}

function collectColors(node, out) {
  if (!node || typeof node !== "object") return;
  if (typeof node.color === "string" && node.color[0] !== "#") out.add(node.color);
  if (Array.isArray(node.children)) for (const child of node.children) collectColors(child, out);
}

function validateNode(node, path, errs) {
  if (!node || typeof node !== "object") { errs.push(`${path}: nie jest obiektem`); return; }
  if (typeof node.type !== "string" || !VALID_TYPES.has(node.type)) {
    errs.push(`${path}: nieznany type="${node.type}" (dozwolone: ${[...VALID_TYPES].join(", ")})`);
  }
  if ("dir" in node && typeof node.dir === "string" && !VALID_DIRS.has(node.dir)) {
    errs.push(`${path}.dir="${node.dir}" (dozwolone: ${[...VALID_DIRS].join(", ")})`);
  }
  for (const f of ["label", "text", "tex"]) {
    if (f in node && node[f] != null && typeof node[f] !== "string") {
      errs.push(`${path}.${f} musi być stringiem, jest ${typeof node[f]}`);
    }
  }
  if ("children" in node && node.children != null && !Array.isArray(node.children)) {
    errs.push(`${path}.children musi być tablicą, jest ${typeof node.children}`);
  } else if (Array.isArray(node.children)) {
    node.children.forEach((c, i) => validateNode(c, `${path}.children[${i}]`, errs));
  }
}

function validate(scene) {
  const errs = [];
  if (!("root" in scene)) {
    errs.push("scena nie ma 'root'");
    return errs;
  }
  validateNode(scene.root, "root", errs);
  const ids = new Set();
  collectIds(scene.root, ids);
  if (ids.__dupes) {
    for (const id of ids.__dupes) errs.push(`zduplikowane id: "${id}"`);
  }
  if ("edges" in scene && scene.edges != null && !Array.isArray(scene.edges)) {
    errs.push(`'edges' musi być tablicą, jest ${typeof scene.edges}`);
    return errs;
  }
  // palette references: ostrzeżenie gdy color węzła/edge nie ma klucza w palette (a nie jest hex)
  if (scene.palette) {
    const used = new Set();
    collectColors(scene.root, used);
    (scene.edges || []).forEach(e => { if (typeof e.color === "string" && e.color[0] !== "#") used.add(e.color); });
    for (const c of used) {
      if (!(c in scene.palette)) errs.push(`color "${c}" użyty, ale brak go w palette`);
    }
  }
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
  const args = { scene: null, style: "hand", out: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--style") {
      args.style = argv[++i];
      if (!["hand", "clean"].includes(args.style)) {
        die("BŁĄD: --style musi być 'hand' albo 'clean'");
      }
    } else if (a === "--out") {
      args.out = argv[++i];
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

  const tpl = fs.readFileSync(TEMPLATE, "utf-8");
  const sceneJson = JSON.stringify(scene).replace(/</g, "\\u003c");
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
