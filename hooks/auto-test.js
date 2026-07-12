#!/usr/bin/env node
// krux — PostToolUse hook: odpala `npm test` gdy edycja dotknęła strzeżonych
// plików w hooks/, test/ albo agents/. Zero-dep: tylko moduły Node.js.
//
// Kontrakt:
// - stdin: JSON z { tool_name, tool_input: { file_path }, cwd? }
// - exit 0 zawsze (hook informacyjny, nie blokuje workflow)
// - wynik: JSON additionalContext z podsumowaniem dla modelu
//
// Opt-out: KRUX_AUTO_TEST=off w env. Zero ruchu gdy user nie chce.
//
// Tylko repo krux — hook odpala testy tylko gdy cwd ma package.json
// z "name":"krux". Chroni przed odpaleniem w obcych repo gdy plugin
// załadowany globalnie.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const WATCH_DIRS = ['hooks', 'test', 'agents'];

function positiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function emitAdditionalContext(message) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext: message,
    },
  }));
}

function isWatchedPath(filePath, repoRoot) {
  if (!filePath) return false;
  const abs = path.isAbsolute(filePath) ? filePath : path.resolve(repoRoot, filePath);
  const rel = path.relative(repoRoot, abs);
  if (rel.startsWith('..')) return false;
  const firstSegment = rel.split(path.sep)[0];
  if (!WATCH_DIRS.includes(firstSegment)) return false;
  return rel.endsWith('.js') || rel.endsWith('.json') || rel.endsWith('.md');
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

  const HOOK_TIMEOUT_MS = positiveInt(process.env.KRUX_AUTO_TEST_TIMEOUT_MS, 72000);
  const startTs = Date.now();
  const result = spawnSync('npm', ['test', '--silent'], {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: HOOK_TIMEOUT_MS,
    env: { ...process.env, CI: '1' },
  });
  const elapsed = Date.now() - startTs;

  const rel = path.relative(repoRoot, path.isAbsolute(filePath) ? filePath : path.resolve(repoRoot, filePath));

  if (result.error && result.error.code === 'ETIMEDOUT') {
    emitAdditionalContext(
      `krux auto-test: TIMEOUT po ${HOOK_TIMEOUT_MS / 1000}s przy zmianie ${rel}. ` +
      'Test suite rośnie — zwiększ KRUX_AUTO_TEST_TIMEOUT_MS lub przyspiesz testy.'
    );
    process.exit(0);
  }

  if (elapsed > HOOK_TIMEOUT_MS * 0.8) {
    process.stderr.write(
      `krux auto-test: testy zajęły ${elapsed}ms (>80% timeoutu ${HOOK_TIMEOUT_MS}ms). ` +
      `Rozważ zwiększenie KRUX_AUTO_TEST_TIMEOUT_MS.\n`
    );
  }

  if (result.status === 0) {
    emitAdditionalContext(`krux auto-test: wszystkie testy przeszły po zmianie ${rel}`);
    process.exit(0);
  }

  const failureOutput = [result.stdout, result.stderr, result.error && result.error.message]
    .filter(Boolean)
    .join('\n');
  const tail = failureOutput.split('\n').slice(-40).join('\n');
  emitAdditionalContext(
    `krux auto-test: TESTY PADŁY po zmianie ${rel}\n` +
    `---\n${tail}\n---\n` +
    'Napraw zanim pójdziesz dalej.'
  );
  process.exit(0);
});
