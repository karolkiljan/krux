const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const SKILL = path.join(ROOT, 'skills', 'krux-rysownik');
const BUILD = path.join(SKILL, 'scripts', 'build.js');
const EXAMPLES = path.join(SKILL, 'reference', 'examples');

test('każdy przykład sceny buduje samodzielny HTML', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'krux-rysownik-'));
  try {
    for (const file of fs.readdirSync(EXAMPLES).filter(name => name.endsWith('.json'))) {
      const out = path.join(tmp, file.replace(/\.json$/, '.html'));
      const result = spawnSync('node', [BUILD, path.join(EXAMPLES, file), '--out', out], {
        encoding: 'utf8',
        timeout: 5000,
      });
      assert.equal(result.status, 0, `${file}: ${result.stderr}`);
      const html = fs.readFileSync(out, 'utf8');
      assert.doesNotMatch(html, /const SCENE\s*=\s*\/\*__SCENE__\*\/\s*null\s*;/, `${file}: scena nie została wstrzyknięta`);
      assert.match(html, /const SCENE\s*=\s*\/\*__SCENE__\*\/\s*\{/, `${file}: brak JSON sceny`);
      assert.match(html, /<!doctype html>/i, `${file}: wynik nie jest HTML`);
      assert.match(html, /typeof rough==="undefined"/, `${file}: brak offline fallback dla rough.js`);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('zły kształt sceny kończy się kontrolowanym błędem bez stack trace', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'krux-rysownik-bad-'));
  try {
    const cases = [
      ['null.json', 'null'],
      ['edge.json', JSON.stringify({ root: { type: 'box', id: 'a' }, edges: [null], palette: { red: '#f00' } })],
      ['palette.json', JSON.stringify({ root: { type: 'box', id: 'a' }, palette: 'red' })],
      ['id.json', JSON.stringify({ root: { type: 'box', id: 1 } })],
      ['grid.json', JSON.stringify({ root: { type: 'group', dir: 'grid', cols: -1, children: [] } })],
      ['anchor.json', JSON.stringify({ root: { type: 'row', children: [{ type: 'box', id: 'a' }, { type: 'box', id: 'b' }] }, edges: [{ from: 'a', to: 'b', fromAnchor: 'middle' }] })],
      ['panel.json', JSON.stringify({ root: { type: 'box' }, sidePanel: { items: 'not-an-array' } })],
    ];
    for (const [file, scene] of cases) {
      const input = path.join(tmp, file);
      fs.writeFileSync(input, scene);
      const result = spawnSync('node', [BUILD, input, '--out', path.join(tmp, `${file}.html`)], {
        encoding: 'utf8',
        timeout: 5000,
      });
      assert.equal(result.status, 1, `${file}: walidacja powinna odrzucić scenę`);
      assert.match(result.stderr, /^BŁĄD walidacji sceny:/);
      assert.doesNotMatch(result.stderr, /TypeError|\n\s+at /, `${file}: wyciekł stack trace`);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('brak wartości --out kończy się kontrolowanym błędem', () => {
  const input = path.join(EXAMPLES, 'simple-flow.json');
  const result = spawnSync('node', [BUILD, input, '--out'], { encoding: 'utf8', timeout: 5000 });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /^BŁĄD: --out wymaga ścieżki pliku/);
  assert.doesNotMatch(result.stderr, /TypeError|\n\s+at /);
});
