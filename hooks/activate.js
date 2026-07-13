#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { stateDir } = require('./lib/state-dir');
const { REMINDER_CORE, resetTurnCount } = require('./lib/drift-guard');

const VALID_MODES = ['on', 'off'];

// Resolution order for default mode:
//   1. <stateDir>/.krux-mode (explicit user choice) beats an inherited shell default —
//      otherwise `stop krux` writes "off" but the next SessionStart silently turns it on.
//   2. KRUX_DEFAULT_MODE environment variable (initial default only)
//   3. 'on'
function getDefaultMode() {
  try {
    const claudeMode = fs.readFileSync(
      path.join(stateDir(), '.krux-mode'), 'utf8'
    ).trim().toLowerCase();
    if (VALID_MODES.includes(claudeMode)) return claudeMode;
  } catch (e) {}

  const envMode = process.env.KRUX_DEFAULT_MODE;
  if (envMode && VALID_MODES.includes(envMode.toLowerCase())) {
    return envMode.toLowerCase();
  }

  return 'on';
}

const claudeDir = stateDir();
const flagPath = path.join(claudeDir, '.krux-active');
const settingsPath = path.join(claudeDir, 'settings.json');
const statuslineAskedPath = path.join(claudeDir, '.krux-statusline-asked');

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { raw += chunk; });
process.stdin.on('end', () => {
  let source = 'startup';
  if (raw) {
    try {
      source = JSON.parse(raw).source || 'startup';
    } catch (e) {
      process.stdout.write('OK');
      process.exit(0);
    }
  }

  const mode = getDefaultMode();

  if (mode === 'off') {
    try { fs.unlinkSync(flagPath); } catch (e) {}
    process.stdout.write('OK');
    process.exit(0);
  }

  try {
    fs.mkdirSync(path.dirname(flagPath), { recursive: true });
    fs.writeFileSync(flagPath, mode);
  } catch (e) {
    console.error('krux: flag write failed:', e.message);
  }

  // Every SessionStart re-injection (any source) is a fresh reinforcement —
  // the mid-conversation drift-guard window (hooks/krux-toggle.js) should
  // count turns since THIS event, not since the session originally started.
  resetTurnCount(claudeDir);

  // On resume the skill body is still in memory from the prior context, so a short
  // reminder is enough. On compact the context was rewritten and the persona can be
  // lost, so re-inject the full lean skill body just like startup.
  const useNativeSkill = (process.env.KRUX_NATIVE_SKILL || '').toLowerCase() === '1';
  let output;
  if (source === 'resume') {
    output = 'KRUX TRYB AKTYWNY — ' + REMINDER_CORE;
  } else if (useNativeSkill) {
    output = 'KRUX TRYB AKTYWNY';
  } else {
    const skillPath = path.join(__dirname, '..', 'skills', 'krux', 'SKILL.md');
    let skillContent;
    try {
      skillContent = fs.readFileSync(skillPath, 'utf8');
    } catch (e) {
      console.error('krux: SKILL.md not found at', skillPath, '-', e.message);
      process.stdout.write('OK');
      process.exit(0);
    }
    const body = skillContent.replace(/^---[\s\S]*?---\s*/, '');
    output = 'KRUX TRYB AKTYWNY\n\n' + body;
  }

  // Statusline is Claude-Code-specific — Codex CLI has no documented equivalent.
  // PLUGIN_DATA presence means we're running under Codex: skip the whole block.
  if (!process.env.PLUGIN_DATA) try {
    const srcScript = path.join(__dirname, 'krux-statusline.sh');
    const stableScript = path.join(claudeDir, '.krux-statusline.sh');
    const stableCommand = `bash "${stableScript}"`;

    let needsCopy = true;
    try {
      const stat = fs.statSync(stableScript);
      if (Date.now() - stat.mtimeMs < 5000) needsCopy = false;
    } catch (e) {}

    if (needsCopy) {
      const tmpPath = stableScript + '.tmp.' + process.pid;
      try {
        fs.copyFileSync(srcScript, tmpPath);
        fs.renameSync(tmpPath, stableScript);
        try { fs.chmodSync(stableScript, 0o755); } catch (e) {}
      } catch (e) {
        try { fs.unlinkSync(tmpPath); } catch (e2) {}
        throw e;
      }
    }

    let settings = {};
    if (fs.existsSync(settingsPath)) {
      try { settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')); } catch (e) {}
    }

    const currentCommand = settings.statusLine?.command || '';
    const isKruxStatusline = currentCommand.includes('krux-statusline');

    if (isKruxStatusline && currentCommand !== stableCommand) {
      const snippet = '"statusLine": { "type": "command", "command": ' + JSON.stringify(stableCommand) + ' }';
      output += '\n\nSTATUSLINE UPDATE AVAILABLE: The krux statusline command path has changed (plugin was updated). ' +
        'Current path may be stale. New stable path: ' + JSON.stringify(stableCommand) + '. ' +
        'Ask the user if they want to update ~/.claude/settings.json with: ' + snippet + '. ' +
        'Only update if user confirms.';
    } else if (!settings.statusLine) {
      if (!fs.existsSync(statuslineAskedPath)) {
        try { fs.writeFileSync(statuslineAskedPath, '1'); } catch (e) {}
        const snippet = '"statusLine": { "type": "command", "command": ' + JSON.stringify(stableCommand) + ' }';
        output += '\n\nSTATUSLINE SETUP NEEDED: The krux plugin includes a statusline badge showing [KRUX] when active. ' +
          'It is not configured yet. ' +
          'To enable, add this to ~/.claude/settings.json: ' +
          snippet + ' ' +
          'Proactively offer to set this up for the user on first interaction.';
      }
    }
  } catch (e) {
    console.error('krux: statusline setup failed:', e.message);
  }

  process.stdout.write(output);
});
