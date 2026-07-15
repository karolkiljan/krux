const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
}

test('.codex-plugin/plugin.json używa wspieranego kontraktu Codexa', () => {
  const manifest = readJson('.codex-plugin/plugin.json');
  assert.equal(manifest.name, 'krux');
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.equal(manifest.skills, './skills/');
  assert.equal('agents' in manifest, false, 'Codex nie ładuje agentów z manifestu pluginu');
  assert.equal(manifest.hooks, './hooks/codex/hooks.json');
  assert.equal(fs.existsSync(path.join(ROOT, 'hooks', 'codex', 'hooks.json')), true);
  assert.deepEqual(
    Object.keys(manifest.interface || {}).filter(key => [
      'displayName',
      'shortDescription',
      'longDescription',
      'developerName',
      'category',
      'capabilities',
      'defaultPrompt',
    ].includes(key)).sort(),
    ['capabilities', 'category', 'defaultPrompt', 'developerName', 'displayName', 'longDescription', 'shortDescription'],
  );
});

test('natywny manifest hooków pokrywa lifecycle Codexa bez zależności Claude', () => {
  const nativePath = path.join(ROOT, 'hooks', 'codex', 'hooks.json');
  const nativeText = fs.readFileSync(nativePath, 'utf8');
  const native = JSON.parse(nativeText).hooks;

  assert.deepEqual(Object.keys(native).sort(), [
    'PostToolUse',
    'SessionStart',
    'Stop',
    'SubagentStart',
    'UserPromptSubmit',
  ]);
  assert.equal(native.SessionStart[0].matcher, 'startup|resume|clear|compact');
  const commands = Object.values(native).flat()
    .flatMap(group => group.hooks)
    .map(hook => hook.command);
  assert.equal(commands.length, 8, 'pięć eventów, osiem definicji komend');
  for (const command of commands) assert.match(command, /\$\{PLUGIN_ROOT\}/);
  assert.doesNotMatch(nativeText, /CLAUDE_PLUGIN_(?:ROOT|DATA)|~\/\.claude/);
});

test('ścieżki w .codex-plugin/plugin.json wskazują na istniejące, śledzone pliki', () => {
  const manifest = readJson('.codex-plugin/plugin.json');
  for (const [key, value] of Object.entries(manifest)) {
    if (typeof value === 'string' && value.startsWith('./')) {
      const target = path.join(ROOT, value);
      assert.equal(fs.existsSync(target), true, `${key}: martwa ścieżka ${value}`);
    }
  }
});
