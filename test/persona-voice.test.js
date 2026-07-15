const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  isMachineExact,
  voiceSignals,
  needsPersonaRewrite,
} = require('../hooks/lib/persona-voice');

test('neutralny finał wymaga korekty', () => {
  assert.equal(needsPersonaRewrite('Dokumentacja została zaktualizowana. Build przechodzi.'), true);
});

test('kanoniczna łamana gramatyka sama jest mierzalnym śladem Kruxa', () => {
  for (const text of [
    'Cache pusty → każdy query w bazę → baza paść.',
    'Zrobione. Robak wynocha, kod stać mocno.',
    'Przyczyna: indeks puchnąć. Fix: indeks wykuć od nowa.',
    'Parser sprawdzać tylko format. Fix: walidacja odrzucać 31 lutego.',
    'Przyczyna: Redis nie wstać.',
    'Dokumentacja zaktualizowana. Build przechodzi. Robota stoi mocno.',
  ]) {
    const signals = voiceSignals(text);
    assert.equal(signals.pass, true, `${text}: ${JSON.stringify(signals)}`);
    assert.equal(needsPersonaRewrite(text), false);
  }
});

test('sam ornament albo sama kompresja nie wystarcza', () => {
  assert.equal(needsPersonaRewrite('Zrobione. Dokumentacja została zaktualizowana.'), true);
  assert.equal(needsPersonaRewrite('Robak został usunięty z parsera.'), true);
  assert.equal(needsPersonaRewrite('Dokumentacja została zaktualizowana → build przechodzi.'), true);
});

test('orkowy słownik plus skompresowany raport tworzą pełny ślad', () => {
  const text = 'Robota zakończona. Linter: 0 błędów. Testy: 83 przeszły, 2 pominięte. Stal.';
  const signals = voiceSignals(text);
  assert.equal(signals.lexicon, true);
  assert.equal(signals.compression, true);
  assert.equal(signals.pass, true);
  assert.equal(needsPersonaRewrite(text), false);
});

test('samo słowo Krux nie udaje persony', () => {
  assert.equal(needsPersonaRewrite('Krux zakończył aktualizację dokumentacji.'), true);
  assert.equal(voiceSignals('Krux zakończył aktualizację dokumentacji.').lexicon, true);
  assert.equal(voiceSignals('Krux zakończył aktualizację dokumentacji.').pass, false);
});

test('formaty maszynowe są nietykalne', () => {
  for (const text of [
    '{"status":"ok"}',
    '[1,2,3]',
    '```js\nexport const ok = true;\n```',
    'fix(parser): reject invalid calendar dates',
    'feat!: remove legacy endpoint',
    '',
  ]) {
    assert.equal(isMachineExact(text), true, text);
    assert.equal(needsPersonaRewrite(text), false, text);
  }
});

test('proza z blokiem kodu nadal podlega ocenie głosu', () => {
  const text = 'Kod został poprawiony:\n```js\nexport const ok = true;\n```';
  assert.equal(isMachineExact(text), false);
  assert.equal(needsPersonaRewrite(text), true);
});
