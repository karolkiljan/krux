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
  assert.equal('hooks' in manifest, false, 'domyślne hooks/hooks.json nie wymaga pola manifestu');
  assert.equal(fs.existsSync(path.join(ROOT, 'hooks', 'hooks.json')), true);
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

test('ścieżki w .codex-plugin/plugin.json wskazują na istniejące, śledzone pliki', () => {
  const manifest = readJson('.codex-plugin/plugin.json');
  for (const [key, value] of Object.entries(manifest)) {
    if (typeof value === 'string' && value.startsWith('./')) {
      const target = path.join(ROOT, value);
      assert.equal(fs.existsSync(target), true, `${key}: martwa ścieżka ${value}`);
    }
  }
});
