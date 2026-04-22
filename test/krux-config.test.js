// Tests for hooks/krux-config.js — getDefaultMode resolution order.

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CONFIG = path.join(__dirname, '..', 'hooks', 'krux-config.js');

let savedEnv;
let savedHome;
let tempHome;

beforeEach(() => {
  savedEnv = process.env.KRUX_DEFAULT_MODE;
  savedHome = process.env.HOME;
  tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'krux-cfg-test-'));
  process.env.HOME = tempHome;
  process.env.USERPROFILE = tempHome;
  delete process.env.KRUX_DEFAULT_MODE;
  // Clear node's cache so each test re-evaluates against fresh env.
  delete require.cache[require.resolve(CONFIG)];
});

afterEach(() => {
  if (savedEnv === undefined) delete process.env.KRUX_DEFAULT_MODE;
  else process.env.KRUX_DEFAULT_MODE = savedEnv;
  process.env.HOME = savedHome;
  fs.rmSync(tempHome, { recursive: true, force: true });
  delete require.cache[require.resolve(CONFIG)];
});

test('defaults to "on" when no env and no file', () => {
  const { getDefaultMode } = require(CONFIG);
  assert.equal(getDefaultMode(), 'on');
});

test('reads from ~/.claude/.krux-mode when present', () => {
  fs.mkdirSync(path.join(tempHome, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(tempHome, '.claude', '.krux-mode'), 'off\n');
  const { getDefaultMode } = require(CONFIG);
  assert.equal(getDefaultMode(), 'off');
});

test('env KRUX_DEFAULT_MODE overrides file', () => {
  fs.mkdirSync(path.join(tempHome, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(tempHome, '.claude', '.krux-mode'), 'off');
  process.env.KRUX_DEFAULT_MODE = 'on';
  const { getDefaultMode } = require(CONFIG);
  assert.equal(getDefaultMode(), 'on');
});

test('invalid env value is ignored, falls back to file', () => {
  fs.mkdirSync(path.join(tempHome, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(tempHome, '.claude', '.krux-mode'), 'off');
  process.env.KRUX_DEFAULT_MODE = 'garbage';
  const { getDefaultMode } = require(CONFIG);
  assert.equal(getDefaultMode(), 'off');
});

test('invalid file content is ignored, falls back to default "on"', () => {
  fs.mkdirSync(path.join(tempHome, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(tempHome, '.claude', '.krux-mode'), 'maybe');
  const { getDefaultMode } = require(CONFIG);
  assert.equal(getDefaultMode(), 'on');
});

test('env value is case-insensitive', () => {
  process.env.KRUX_DEFAULT_MODE = 'OFF';
  const { getDefaultMode } = require(CONFIG);
  assert.equal(getDefaultMode(), 'off');
});
