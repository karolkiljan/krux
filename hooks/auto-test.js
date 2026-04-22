#!/usr/bin/env node
// krux — PostToolUse hook: odpala `npm test` gdy edycja dotknęła hooks/*.js
// albo test/*.js. Zero-dep: tylko node:child_process.
//
// Kontrakt:
// - stdin: JSON z { tool_name, tool_input: { file_path }, cwd? }
// - exit 0 zawsze (hook informacyjny, nie blokuje workflow)
// - wynik: stdout z podsumowaniem dla modelu (widoczne w jego contextcie)
//
// Opt-out: KRUX_AUTO_TEST=off w env. Zero ruchu gdy user nie chce.
//
// Tylko repo krux — hook odpala testy tylko gdy cwd ma package.json
// z "name":"krux". Chroni przed odpaleniem w obcych repo gdy plugin
// załadowany globalnie.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const WATCH_DIRS = ['hooks', 'test'];

function isWatchedPath(filePath, repoRoot) {
  if (!filePath) return false;
  const abs = path.isAbsolute(filePath) ? filePath : path.resolve(repoRoot, filePath);
  const rel = path.relative(repoRoot, abs);
  if (rel.startsWith('..')) return false;
  const firstSegment = rel.split(path.sep)[0];
  if (!WATCH_DIRS.includes(firstSegment)) return false;
  return rel.endsWith('.js');
}

function isKruxRepo(repoRoot) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
    return pkg.name === 'krux';
  } catch (e) {
    return false;
  }
}

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { raw += chunk; });
process.stdin.on('end', () => {
  if ((process.env.KRUX_AUTO_TEST || '').toLowerCase() === 'off') process.exit(0);

  let data = {};
  try { data = JSON.parse(raw); } catch (e) { process.exit(0); }

  const toolName = data.tool_name || '';
  if (!['Edit', 'Write', 'MultiEdit'].includes(toolName)) process.exit(0);

  const filePath = (data.tool_input && data.tool_input.file_path) || '';
  const repoRoot = data.cwd || process.cwd();

  if (!isKruxRepo(repoRoot)) process.exit(0);
  if (!isWatchedPath(filePath, repoRoot)) process.exit(0);

  const result = spawnSync('npm', ['test', '--silent'], {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: 60000,
    env: { ...process.env, CI: '1' },
  });

  const rel = path.relative(repoRoot, path.isAbsolute(filePath) ? filePath : path.resolve(repoRoot, filePath));

  if (result.status === 0) {
    process.stdout.write(`krux auto-test: wszystkie testy przeszły po zmianie ${rel}\n`);
    process.exit(0);
  }

  const tail = (result.stdout || '').split('\n').slice(-40).join('\n');
  process.stdout.write(
    `krux auto-test: TESTY PADŁY po zmianie ${rel}\n` +
    `---\n${tail}\n---\n` +
    `Napraw zanim pójdziesz dalej.\n`
  );
  process.exit(0);
});
