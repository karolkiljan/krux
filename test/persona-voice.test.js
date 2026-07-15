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

test('kanoniczny głos łączy łamaną gramatykę z kompresją albo słownikiem', () => {
  for (const text of [
    'Cache pusty → każdy query w bazę → baza paść.',
    'Zrobione. Robak wynocha, kod stać mocno.',
    'Przyczyna: indeks puchnąć. Fix: indeks wykuć od nowa.',
    'Parser sprawdzać tylko format. Fix: walidacja odrzucać 31 lutego.',
    'Przyczyna: Redis nie wstać.',
    'Circuit breaker otwierać po 5 błędach → cooldown 30 s.',
    'Breaker otworzyć po 5 błędach → cooldown 30 s.',
    'Dokumentacja zaktualizowana. Build przechodzi, robota zakończona.',
    'Dokumentacja zaktualizowana. Build przechodzi. Robota stoi mocno.',
  ]) {
    const signals = voiceSignals(text);
    assert.equal(signals.pass, true, `${text}: ${JSON.stringify(signals)}`);
    assert.equal(needsPersonaRewrite(text), false);
  }
});

test('klasyfikator łapie techniczne podmioty i wtrącenia z prawdziwych odpowiedzi Codexa', () => {
  for (const text of [
    'Circuit breaker otwierać po 5 błędach → cooldown 30 s.',
    'Przyczyna: walidacja sprawdzać tylko format. Fix: parsować ściśle.',
    'Testy: 83 przejść, 2 pominięte → zielono.',
    'Kolejka pełna → producent nie mieć miejsca, więc blokować.',
  ]) {
    const signals = voiceSignals(text);
    assert.equal(signals.brokenGrammar, true, `${text}: ${JSON.stringify(signals)}`);
    assert.equal(signals.compression, true, `${text}: ${JSON.stringify(signals)}`);
    assert.equal(signals.pass, true, `${text}: ${JSON.stringify(signals)}`);
  }
});

test('jedna cecha głosu nie wystarcza', () => {
  assert.equal(needsPersonaRewrite('Zrobione. Dokumentacja została zaktualizowana.'), true);
  assert.equal(needsPersonaRewrite('Robak został usunięty z parsera.'), true);
  assert.equal(needsPersonaRewrite('Dokumentacja została zaktualizowana → build przechodzi.'), true);
  assert.equal(needsPersonaRewrite('Circuit breaker otwierać po 5 błędach.'), true);
});

test('łamana gramatyka, orkowy słownik i kompresja tworzą pełny ślad', () => {
  const text = 'Robota zakończona. Linter: 0 błędów. Testy: 83 przejść, 2 pominięte. Stal.';
  const signals = voiceSignals(text);
  assert.equal(signals.brokenGrammar, true);
  assert.equal(signals.lexicon, true);
  assert.equal(signals.compression, true);
  assert.equal(signals.pass, true);
  assert.equal(needsPersonaRewrite(text), false);
});

test('pierwsza osoba i oferta unieważniają nawet dodatni ślad głosu', () => {
  for (const text of [
    'Sprawdziłem kod. Testy zielone.',
    'Kod działać. Mogę też poprawić dokumentację.',
  ]) {
    const signals = voiceSignals(text);
    assert.equal(signals.pass, false, `${text}: ${JSON.stringify(signals)}`);
    assert.equal(needsPersonaRewrite(text), true, text);
  }
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
