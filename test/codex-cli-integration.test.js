const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const codexProbe = spawnSync('codex', ['--version'], { encoding: 'utf8' });
const HAS_CODEX = codexProbe.status === 0;

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
  fs.mkdirSync(codexHome, { recursive: true });

  const env = {
    ...process.env,
    HOME: home,
    CODEX_HOME: codexHome,
  };
  delete env.PLUGIN_DATA;

  try {
    runCodex(['plugin', 'marketplace', 'add', ROOT, '--json'], env);
    const installed = JSON.parse(
      runCodex(['plugin', 'add', 'krux@krux-marketplace', '--json'], env),
    );

    assert.equal(installed.name, 'krux');
    assert.equal(installed.version, '2.9.0');

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
    assert.equal('hooks' in installedManifest, false);
    assert.equal(
      fs.existsSync(path.join(installed.installedPath, 'hooks', 'hooks.json')),
      true,
      'default hook manifest must be present in the installed plugin',
    );
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
