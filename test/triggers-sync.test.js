const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

test('triggers.json zsynchronizowany z agents/<ork>.md description', () => {
  const triggersPath = path.join(ROOT, 'agents', 'triggers.json');
  const triggers = JSON.parse(fs.readFileSync(triggersPath, 'utf8'));

  const violations = [];
  for (const [orkName, words] of Object.entries(triggers)) {
    const orkFile = path.join(ROOT, 'agents', `${orkName}.md`);
    if (!fs.existsSync(orkFile)) {
      violations.push(`${orkName}: plik agents/${orkName}.md nie istnieje`);
      continue;
    }

    const content = fs.readFileSync(orkFile, 'utf8');
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!fmMatch) {
      violations.push(`${orkName}: brak frontmatter YAML`);
      continue;
    }

    const description = (fmMatch[1].match(/description:\s*>([\s\S]*?)(?=\n[a-z]+:|$)/) || [])[1] || '';
    const descLower = description.toLowerCase();

    for (const word of words) {
      if (!descLower.includes(word.toLowerCase())) {
        violations.push(`${orkName}: trigger "${word}" nie ma w description`);
      }
    }
  }

  assert.deepEqual(violations, [], `Naruszenia synchronizacji:\n  ${violations.join('\n  ')}`);
});

test('każdy plik agents/ork-*.md jest w triggers.json', () => {
  const triggers = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'agents', 'triggers.json'), 'utf8')
  );
  const orkFiles = fs.readdirSync(path.join(ROOT, 'agents'))
    .filter(f => f.startsWith('ork-') && f.endsWith('.md'))
    .map(f => f.replace(/\.md$/, ''));

  const missing = orkFiles.filter(name => !(name in triggers));
  assert.deepEqual(missing, [], `Orkowie bez wpisu w triggers.json: ${missing.join(', ')}`);
});
