const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
}

test('trzy manifesty mają tę samą wersję', () => {
  const versions = [
    readJson('package.json').version,
    readJson('.claude-plugin/plugin.json').version,
    readJson('.claude-plugin/marketplace.json').plugins[0].version,
  ];
  assert.equal(new Set(versions).size, 1, `wersje rozjechane: ${versions.join(', ')}`);
});

test('package.json wystawia pełną suitę testów', () => {
  const scripts = readJson('package.json').scripts;
  assert.equal(scripts.test, 'node --test "test/**/*.test.js"');
});

test('hooks.json ma cytowane ścieżki do istniejących hooków', () => {
  const groups = Object.values(readJson('hooks/hooks.json').hooks).flat();
  const commands = groups.flatMap(group => group.hooks).map(hook => hook.command);
  assert.ok(commands.length > 0, 'brak komend hooków');

  for (const command of commands) {
    const match = command.match(/^node "\$\{CLAUDE_PLUGIN_ROOT\}(\/hooks\/[^"/]+\.js)"$/);
    assert.ok(match, `niecytowana albo obca komenda: ${command}`);
    const target = path.join(ROOT, match[1]);
    assert.equal(fs.existsSync(target), true, `martwy target: ${match[1]}`);
    const tracked = spawnSync('git', ['ls-files', '--error-unmatch', path.relative(ROOT, target)], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    assert.equal(tracked.status, 0, `target nie wejdzie do release: ${match[1]}`);
  }
});

test('flow nie włącza głosu persony', () => {
  const flow = fs.readFileSync(path.join(ROOT, 'skills', 'krux-flow', 'SKILL.md'), 'utf8');
  assert.match(flow, /Flow definiuje strukturę, nie głos/);
  assert.match(flow, /Flow nie włącza persony/);
  assert.doesNotMatch(flow, /Krux obowiązuje \(jak wszędzie\)/);
});

test('komendy hooków działają, gdy katalog pluginu ma spację', { skip: process.platform === 'win32' }, () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'krux hook path '));
  const linkedRoot = path.join(tmp, 'plugin root');
  const home = path.join(tmp, 'home');
  fs.symlinkSync(ROOT, linkedRoot, 'dir');
  fs.mkdirSync(home);

  try {
    const groups = Object.values(readJson('hooks/hooks.json').hooks).flat();
    const commands = groups.flatMap(group => group.hooks).map(hook => hook.command);
    for (const command of commands) {
      const result = spawnSync(command, {
        shell: true,
        input: '{}',
        encoding: 'utf8',
        env: { ...process.env, CLAUDE_PLUGIN_ROOT: linkedRoot, HOME: home },
        timeout: 5000,
      });
      assert.equal(result.status, 0, `${command}: ${result.stderr}`);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('każdy śledzony katalog skilla rejestruje komendę przez zgodny frontmatter', () => {
  const listed = spawnSync('git', ['ls-files', 'skills/*/SKILL.md'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  assert.equal(listed.status, 0);
  const files = listed.stdout.trim().split('\n').filter(Boolean);
  assert.ok(files.length > 0, 'brak śledzonych skilli');
  assert.equal(fs.existsSync(path.join(ROOT, 'commands')), false, 'legacy commands/ dubluje rejestrację skilli');

  for (const file of files) {
    const directory = path.basename(path.dirname(file));
    const content = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const frontmatter = (content.match(/^---\n([\s\S]*?)\n---/) || [])[1] || '';
    assert.match(frontmatter, new RegExp(`^name:\\s*${directory}\\s*$`, 'm'), `${file}: name nie zgadza się z katalogiem`);
  }
});
