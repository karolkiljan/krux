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

test('cztery manifesty mają tę samą wersję', () => {
  const versions = [
    readJson('package.json').version,
    readJson('.claude-plugin/plugin.json').version,
    readJson('.claude-plugin/marketplace.json').plugins[0].version,
    readJson('.codex-plugin/plugin.json').version,
  ];
  assert.equal(new Set(versions).size, 1, `wersje rozjechane: ${versions.join(', ')}`);
  assert.equal(versions[0], '2.10.0');
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

test('komendy hooków działają, gdy katalog pluginu ma spację', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'krux hook path '));
  const linkedRoot = path.join(tmp, 'plugin root');
  const home = path.join(tmp, 'home');
  fs.symlinkSync(ROOT, linkedRoot, 'dir');
  fs.mkdirSync(home);

  try {
    const groups = Object.values(readJson('hooks/hooks.json').hooks).flat();
    const commands = groups.flatMap(group => group.hooks).map(hook => hook.command);
    for (const command of commands) {
      const env = { ...process.env, CLAUDE_PLUGIN_ROOT: linkedRoot, HOME: home };
      delete env.PLUGIN_DATA;
      const result = spawnSync(command, {
        shell: true,
        input: '{}',
        encoding: 'utf8',
        env,
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

test('README dokumentuje kompletną ścieżkę Codex CLI', () => {
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  assert.match(readme, /## Codex CLI/);
  assert.match(readme, /codex plugin marketplace add karolkiljan\/krux/);
  assert.match(readme, /codex plugin add krux@krux-marketplace/);
  assert.match(readme, /\$krux:krux/);
  assert.match(readme, /\$krux:krux-flow/);
  assert.match(readme, /\/hooks/);
  assert.match(readme, /PLUGIN_DATA/);
  assert.match(readme, /Node\.js/);
});

test('skille i dokumentacja maintainera używają natywnego adaptera Codexa', () => {
  const maintainer = fs.readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8');
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  const krux = fs.readFileSync(path.join(ROOT, 'skills', 'krux', 'SKILL.md'), 'utf8');
  const flow = fs.readFileSync(path.join(ROOT, 'skills', 'krux-flow', 'SKILL.md'), 'utf8');
  const packageJson = readJson('package.json');

  assert.doesNotMatch(maintainer, /agents-codex|generate:codex-agents/);
  assert.match(maintainer, /orchestration-codex\.md/);
  assert.match(krux, /\$krux:krux/);
  assert.match(flow, /\$krux:krux-flow/);
  assert.doesNotMatch(flow, /Claude proponuje|Claude:/);
  assert.match(readme, /Statusline jest tylko dla Claude Code/);
  assert.ok(packageJson.keywords.includes('codex-plugin'));
});

test('deklarowana licencja MIT ma dystrybuowany plik LICENSE', () => {
  const declared = [
    readJson('package.json').license,
    readJson('.claude-plugin/plugin.json').license,
    readJson('.codex-plugin/plugin.json').license,
  ];
  assert.deepEqual([...new Set(declared)], ['MIT']);

  const license = fs.readFileSync(path.join(ROOT, 'LICENSE'), 'utf8');
  assert.match(license, /^MIT License/);
  assert.match(license, /Copyright \(c\) 2026 Karol Kiljan/);
  assert.match(license, /Permission is hereby granted, free of charge/);
});

test('testy hooków ignorują ambient PLUGIN_DATA', () => {
  const pluginData = fs.mkdtempSync(path.join(os.tmpdir(), 'krux-ambient-plugin-data-'));
  try {
    const env = { ...process.env, PLUGIN_DATA: pluginData };
    delete env.NODE_TEST_CONTEXT;
    const result = spawnSync(process.execPath, [
      '--test',
      'test/activate.test.js',
      'test/integration.test.js',
      'test/krux-toggle.test.js',
      'test/krux-flow-toggle.test.js',
    ], {
      cwd: ROOT,
      env,
      encoding: 'utf8',
      timeout: 30_000,
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.deepEqual(fs.readdirSync(pluginData), []);
  } finally {
    fs.rmSync(pluginData, { recursive: true, force: true });
  }
});

test('dystrybucja nie zawiera obsługi Windows ani PowerShell', () => {
  assert.equal(fs.existsSync(path.join(ROOT, 'hooks', 'krux-statusline.ps1')), false);
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  assert.match(readme, /macOS (?:albo|lub) Linux/);

  // Docs mogą wspominać Windows (np. „Windows nieobsługiwany") — zakaz dotyczy
  // KODU obsługi Windows i instrukcji PowerShell/cmd, nie samego słowa.
  const forbiddenByFile = {
    'hooks/activate.js': /win32|powershell|krux-statusline\.ps1/i,
    'hooks/krux-toggle.js': /cross-platform/i,
    'README.md': /powershell|cmd\.exe|krux-statusline\.ps1/i,
    'CLAUDE.md': /powershell|cmd\.exe|krux-statusline\.ps1/i,
    '.gitattributes': /windows|autocrlf/i,
    'test/activate.test.js': /USERPROFILE|win32|powershell|krux-statusline\.ps1/i,
    'test/integration.test.js': /USERPROFILE/i,
    'test/krux-toggle.test.js': /USERPROFILE/i,
    'test/krux-flow-toggle.test.js': /USERPROFILE/i,
    'test/codex-cli-integration.test.js': /USERPROFILE/i,
  };

  for (const [file, pattern] of Object.entries(forbiddenByFile)) {
    const content = fs.readFileSync(path.join(ROOT, file), 'utf8');
    assert.doesNotMatch(content, pattern, `${file}: znaleziono ${pattern}`);
  }
});
