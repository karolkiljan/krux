const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const AGENTS_DIR = path.join(ROOT, 'agents');

function listOrkFiles() {
  return fs.readdirSync(AGENTS_DIR)
    .filter(f => f.startsWith('ork-') && f.endsWith('.md'));
}

function frontmatter(content) {
  const m = content.match(/^---\n([\s\S]*?)\n---/);
  return m ? m[1] : '';
}

test('każdy agent ma frontmatter z name/description/tools', () => {
  const orkFiles = listOrkFiles();
  assert.ok(orkFiles.length > 0, 'brak plików agentów');

  for (const file of orkFiles) {
    const content = fs.readFileSync(path.join(AGENTS_DIR, file), 'utf8');
    const fm = frontmatter(content);

    assert.match(fm, /^name:\s*ork-/m, `${file}: brak name`);
    assert.match(fm, /^description:\s*>/m, `${file}: brak description (folded scalar)`);
    assert.match(fm, /^tools:\s*\[/m, `${file}: brak tools`);
  }
});

test('description nie używa <example> ani inline user:/assistant:', () => {
  const orkFiles = listOrkFiles();
  for (const file of orkFiles) {
    const content = fs.readFileSync(path.join(AGENTS_DIR, file), 'utf8');
    const fm = frontmatter(content);

    assert.doesNotMatch(fm, /<example>/i, `${file}: <example> w frontmatter łamie YAML`);
    assert.doesNotMatch(fm, /^\s*(user|assistant):/im, `${file}: inline user:/assistant: w frontmatter`);
  }
});

test('agents/_common.md istnieje', () => {
  assert.equal(fs.existsSync(path.join(AGENTS_DIR, '_common.md')), true);
});

test('każdy ork odsyła do _common.md', () => {
  const orkFiles = listOrkFiles();
  for (const file of orkFiles) {
    const content = fs.readFileSync(path.join(AGENTS_DIR, file), 'utf8');
    assert.match(content, /agents\/_common\.md/, `${file}: brak odsyłacza do _common.md`);
  }
});

test('body orka (po frontmatter) ≤50 linii', () => {
  const orkFiles = listOrkFiles();
  for (const file of orkFiles) {
    const content = fs.readFileSync(path.join(AGENTS_DIR, file), 'utf8');
    const m = content.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
    const body = m ? m[1] : content;
    const lines = body.split('\n').filter(l => l.length > 0).length;
    assert.ok(lines <= 50, `${file}: body ma ${lines} linii (limit 50)`);
  }
});
