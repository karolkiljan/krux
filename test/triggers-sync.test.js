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

test('lista "Wzywaj na" nie zawiera triggerów spoza triggers.json', () => {
  const triggers = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'agents', 'triggers.json'), 'utf8')
  );
  const violations = [];

  for (const [orkName, expected] of Object.entries(triggers)) {
    const content = fs.readFileSync(path.join(ROOT, 'agents', `${orkName}.md`), 'utf8');
    const fm = (content.match(/^---\n([\s\S]*?)\n---/) || [])[1] || '';
    const triggerLine = (fm.match(/Wzywaj na:\s*([^\n]+)/i) || [])[1] || '';
    const actual = triggerLine.split(',').map(word => word.trim().replace(/\.$/, '')).filter(Boolean);
    const normalizedExpected = expected.map(word => word.toLowerCase()).sort();
    const normalizedActual = actual.map(word => word.toLowerCase()).sort();

    if (JSON.stringify(normalizedActual) !== JSON.stringify(normalizedExpected)) {
      violations.push(`${orkName}: description=${JSON.stringify(actual)}, triggers.json=${JSON.stringify(expected)}`);
    }
  }

  assert.deepEqual(violations, [], `Naruszenia dwukierunkowej synchronizacji:\n  ${violations.join('\n  ')}`);
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

test('README pokazuje dokładne triggery z triggers.json', () => {
  const triggers = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'agents', 'triggers.json'), 'utf8')
  );
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');

  for (const [orkName, expected] of Object.entries(triggers)) {
    const row = readme.split('\n').find(line => line.includes(`@krux:${orkName}`));
    assert.ok(row, `${orkName}: brak w tabeli README`);
    const documented = [...row.matchAll(/„([^"”]+)["”]/g)].map(match => match[1]);
    assert.deepEqual(documented, expected, `${orkName}: README ma inne triggery`);
  }
});

test('triggery domenowe nie używają ogólnych słów "nowy" i "model"', () => {
  const triggers = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'agents', 'triggers.json'), 'utf8')
  );
  const flattened = Object.values(triggers).flat().map(word => word.toLowerCase());
  assert.equal(flattened.includes('nowy'), false, '"nowy" odpala prototyper dla dowolnego nowego problemu');
  assert.equal(flattened.includes('model'), false, '"model" myli backend z pytaniami o modele LLM');
});
