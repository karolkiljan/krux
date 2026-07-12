const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
}

test('.codex-plugin/plugin.json istnieje i ma wymagane pola', () => {
  const manifest = readJson('.codex-plugin/plugin.json');
  assert.equal(manifest.name, 'krux');
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.equal(manifest.skills, './skills/');
  assert.equal(manifest.hooks, './hooks/hooks.json');
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
