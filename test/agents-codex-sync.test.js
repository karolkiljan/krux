const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { generateAll } = require('../scripts/generate-codex-agents');

test('agents-codex/*.toml są aktualne względem agents/ork-*.md', () => {
  const results = generateAll();
  assert.ok(results.length > 0, 'brak wygenerowanych orków — generateAll() zwróciło pustą listę');
  for (const { name, content, outPath } of results) {
    assert.equal(fs.existsSync(outPath), true, `${name}: brak commitowanego pliku ${outPath} — uruchom npm run generate:codex-agents`);
    const committed = fs.readFileSync(outPath, 'utf8');
    assert.equal(committed, content, `${name}: agents-codex/${name}.toml jest nieaktualny — uruchom npm run generate:codex-agents`);
  }
});
