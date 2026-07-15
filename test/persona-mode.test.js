const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  classifyPersonaPrompt,
  getDefaultMode,
  isStrictFormatPrompt,
} = require('../hooks/lib/persona-mode');

test('classifyPersonaPrompt zachowuje wszystkie aliasy obu hostów', () => {
  for (const input of ['krux', 'włącz krux', 'wlacz krux', 'start krux', 'aktywuj krux', '$krux:krux on', '/krux:krux on']) {
    assert.equal(classifyPersonaPrompt(input), 'on');
  }
  for (const input of ['stop krux', 'normalny tryb', 'wyłącz krux', 'wylacz krux', '$krux:krux off', '/krux:krux off']) {
    assert.equal(classifyPersonaPrompt(input), 'off');
  }
  assert.equal(classifyPersonaPrompt('$krux:krux'), 'one-shot');
  assert.equal(classifyPersonaPrompt('/krux:krux'), 'one-shot');
  assert.equal(classifyPersonaPrompt('napraw krux parser'), null);
});

test('klasyfikator normalizuje spacje i wielkość liter', () => {
  assert.equal(classifyPersonaPrompt('  KRUX  '), 'on');
  assert.equal(classifyPersonaPrompt(null), null);
});

test('plik trybu bije env, env bije domyślne on', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'krux-mode-'));
  try {
    assert.equal(getDefaultMode(dir, {}), 'on');
    assert.equal(getDefaultMode(dir, { KRUX_DEFAULT_MODE: 'off' }), 'off');
    fs.writeFileSync(path.join(dir, '.krux-mode'), 'on');
    assert.equal(getDefaultMode(dir, { KRUX_DEFAULT_MODE: 'off' }), 'on');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('niepoprawne wartości pliku i env wracają do on', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'krux-mode-'));
  try {
    fs.writeFileSync(path.join(dir, '.krux-mode'), 'maybe');
    assert.equal(getDefaultMode(dir, { KRUX_DEFAULT_MODE: 'unknown' }), 'on');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('klasyfikator łapie format maszynowy, ale nie zwykłe słowo JSON', () => {
  for (const prompt of [
    'Zwróć wyłącznie JSON. Bez markdown.',
    'Zwroc wylacznie JSON.',
    'Napisz commit message dla tej zmiany.',
    'Podaj dokładny format wskazany niżej.',
    'Podaj dokladny format wskazany nizej.',
    'Return this in the exact format.',
  ]) assert.equal(isStrictFormatPrompt(prompt), true, prompt);

  assert.equal(isStrictFormatPrompt('Wyjaśnij, jak parser czyta JSON.'), false);
  assert.equal(isStrictFormatPrompt('Dodaj walidację do kodu.'), false);
});
