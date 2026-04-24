#!/usr/bin/env node
// krux — PreToolUse guard: blokuje edycję package.json, plugin.json lub
// marketplace.json gdy wersje już rozjechane. Chroni synchronizację
// wymaganą przez CLAUDE.md.
//
// Kontrakt:
// - stdin: JSON z { tool_name, tool_input: { file_path, ... }, cwd? }
// - exit 0: pozwala przejść
// - exit 2: blokuje (stderr idzie do modelu jako feedback)
//
// Logika: gdy user edytuje JEDEN z trzech plików wersji, sprawdź czy aktualne
// wersje w repo są zgodne. Jeśli już rozjechane — zatrzymaj, niech user użyje
// /krux-bump albo naprawi ręcznie zamiast pogłębiać dryf.

const fs = require('fs');
const path = require('path');

const GUARDED_FILES = ['package.json', '.claude-plugin/plugin.json', '.claude-plugin/marketplace.json'];

function readVersion(file) {
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    return typeof data.version === 'string' ? data.version : null;
  } catch (e) {
    return null;
  }
}

function readMarketplaceVersion(file) {
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    const plugin = Array.isArray(data.plugins) ? data.plugins.find(p => p && p.name === 'krux') : null;
    return plugin && typeof plugin.version === 'string' ? plugin.version : null;
  } catch (e) {
    return null;
  }
}

function isGuardedPath(filePath, repoRoot) {
  if (!filePath) return false;
  const abs = path.isAbsolute(filePath) ? filePath : path.resolve(repoRoot, filePath);
  const rel = path.relative(repoRoot, abs);
  return GUARDED_FILES.includes(rel);
}

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { raw += chunk; });
process.stdin.on('end', () => {
  let data = {};
  try { data = JSON.parse(raw); } catch (e) { process.exit(0); }

  const toolName = data.tool_name || '';
  if (!['Edit', 'Write', 'MultiEdit'].includes(toolName)) process.exit(0);

  const filePath = (data.tool_input && data.tool_input.file_path) || '';
  const repoRoot = data.cwd || process.cwd();

  if (!isGuardedPath(filePath, repoRoot)) process.exit(0);

  const pkgFile = path.join(repoRoot, 'package.json');
  const pluginFile = path.join(repoRoot, '.claude-plugin', 'plugin.json');
  const marketFile = path.join(repoRoot, '.claude-plugin', 'marketplace.json');

  const pkgVer = readVersion(pkgFile);
  const pluginVer = readVersion(pluginFile);
  const marketVer = readMarketplaceVersion(marketFile);

  // Brak któregoś pliku → nie ten repo albo świeży bootstrap, nie blokuj.
  if (!pkgVer || !pluginVer || !marketVer) process.exit(0);

  if (pkgVer !== pluginVer || pkgVer !== marketVer) {
    process.stderr.write(
      `krux version-sync-guard: wersje rozjechane.\n` +
      `  package.json: ${pkgVer}\n` +
      `  .claude-plugin/plugin.json: ${pluginVer}\n` +
      `  .claude-plugin/marketplace.json: ${marketVer}\n` +
      `Najpierw zsynchronizuj (/krux-bump albo ręcznie), potem edytuj.\n`
    );
    process.exit(2);
  }

  process.exit(0);
});
