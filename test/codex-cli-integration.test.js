const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const codexProbe = spawnSync('codex', ['--version'], { encoding: 'utf8' });
const HAS_CODEX = codexProbe.status === 0;
const COPY_EXCLUDES = new Set([
  '.git',
  '.worktrees',
  'benchmarks',
  'node_modules',
  '.idea',
  '.claude',
  '.remember',
]);

function copyPluginSource(target) {
  fs.cpSync(ROOT, target, {
    recursive: true,
    filter(source) {
      const relative = path.relative(ROOT, source);
      if (!relative) return true;
      return !COPY_EXCLUDES.has(relative.split(path.sep)[0]);
    },
  });
}

function runCodex(args, env) {
  const result = spawnSync('codex', args, {
    cwd: ROOT,
    env,
    encoding: 'utf8',
    timeout: 30_000,
  });
  assert.equal(
    result.status,
    0,
    `codex ${args.join(' ')} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );
  return result.stdout;
}

test('Codex CLI instaluje plugin i odkrywa wyłącznie wspierane komponenty', { skip: !HAS_CODEX }, () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'krux-codex-cli-'));
  const home = path.join(temp, 'home');
  const codexHome = path.join(home, '.codex');
  const marketplaceRoot = path.join(temp, 'marketplace');
  fs.mkdirSync(codexHome, { recursive: true });
  copyPluginSource(marketplaceRoot);

  const env = {
    ...process.env,
    HOME: home,
    CODEX_HOME: codexHome,
  };
  delete env.PLUGIN_DATA;

  try {
    runCodex(['plugin', 'marketplace', 'add', marketplaceRoot, '--json'], env);
    const installed = JSON.parse(
      runCodex(['plugin', 'add', 'krux@krux-marketplace', '--json'], env),
    );

    assert.equal(installed.name, 'krux');
    assert.equal(installed.version, '2.11.0');

    const promptInput = runCodex(
      ['debug', 'prompt-input', '$krux:krux-flow on'],
      env,
    );
    assert.match(promptInput, /krux:krux:/);
    assert.match(promptInput, /krux:krux-flow:/);
    assert.doesNotMatch(promptInput, /agents-codex|ork-sedzia/);

    const installedManifest = JSON.parse(
      fs.readFileSync(path.join(installed.installedPath, '.codex-plugin', 'plugin.json'), 'utf8'),
    );
    assert.equal('agents' in installedManifest, false);
    assert.equal(installedManifest.hooks, './hooks/codex/hooks.json');
    assert.equal(
      fs.existsSync(path.join(installed.installedPath, 'hooks', 'codex', 'hooks.json')),
      true,
      'native Codex hook manifest must be present in the installed plugin',
    );

    const pluginData = path.join(temp, 'plugin-data');
    fs.mkdirSync(pluginData);
    const hook = spawnSync('node', [
      path.join(installed.installedPath, 'hooks', 'codex', 'persona-context.js'),
    ], {
      input: JSON.stringify({
        hook_event_name: 'SessionStart',
        source: 'startup',
        session_id: 'sid-installed',
      }),
      env: { ...env, PLUGIN_DATA: pluginData },
      encoding: 'utf8',
      timeout: 5000,
    });
    assert.equal(hook.status, 0, hook.stderr);
    const output = JSON.parse(hook.stdout).hookSpecificOutput;
    assert.equal(output.hookEventName, 'SessionStart');
    assert.match(output.additionalContext, /KRUX PERSONA ACTIVE/);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
