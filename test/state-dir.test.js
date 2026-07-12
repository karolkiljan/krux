const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const { stateDir } = require('../hooks/lib/state-dir');

function withEnv(key, value, fn) {
  const original = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
  try {
    fn();
  } finally {
    if (original === undefined) delete process.env[key];
    else process.env[key] = original;
  }
}

test('bez PLUGIN_DATA: zwraca ~/.claude', () => {
  withEnv('PLUGIN_DATA', undefined, () => {
    assert.equal(stateDir(), path.join(os.homedir(), '.claude'));
  });
});

test('z PLUGIN_DATA: zwraca jego wartość, nie ~/.claude', () => {
  withEnv('PLUGIN_DATA', '/tmp/krux-codex-plugin-data', () => {
    assert.equal(stateDir(), '/tmp/krux-codex-plugin-data');
  });
});

test('pusty string PLUGIN_DATA traktowany jak nieustawiony (fallback do ~/.claude)', () => {
  withEnv('PLUGIN_DATA', '', () => {
    assert.equal(stateDir(), path.join(os.homedir(), '.claude'));
  });
});
