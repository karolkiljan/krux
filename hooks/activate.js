#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const os = require('os');
const { getDefaultMode } = require('./snaf-config');

const claudeDir = path.join(os.homedir(), '.claude');
const flagPath = path.join(claudeDir, '.snaf-active');
const settingsPath = path.join(claudeDir, 'settings.json');
const statuslineAskedPath = path.join(claudeDir, '.snaf-statusline-asked');

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
  console.error('snaf: flag write failed:', e.message);
}

// SessionStart source: "startup" | "resume" | "clear" | "compact"
let source = 'startup';
try {
  let raw = '';
  if (!process.stdin.isTTY) {
    raw = fs.readFileSync(0, 'utf8');
    if (raw) source = JSON.parse(raw).source || 'startup';
  }
} catch (e) {}

// On resume/compact the skill body is already in memory from the prior context
// (resume) or injected via PreCompact notes (compact). Emit a short reminder
// instead of re-injecting the full skill — saves tokens.
let output;
if (source === 'resume' || source === 'compact') {
  output = 'SNAF TRYB AKTYWNY — persona Krux dalej działa. `/snaf-help` dla zasad.';
} else {
  const skillPath = path.join(__dirname, '..', 'skills', 'snaf', 'SKILL.md');
  let skillContent;
  try {
    skillContent = fs.readFileSync(skillPath, 'utf8');
  } catch (e) {
    console.error('snaf: SKILL.md not found at', skillPath, '-', e.message);
    process.stdout.write('OK');
    process.exit(0);
  }
  const body = skillContent.replace(/^---[\s\S]*?---\s*/, '');
  output = 'SNAF TRYB AKTYWNY\n\n' + body;
}

// Statusline: copy script to stable path on every activation so updates propagate.
// settings.json always points to ~/.claude/.snaf-statusline.{sh,ps1} — never versioned cache path.
try {
  const isWindows = process.platform === 'win32';
  const scriptName = isWindows ? 'snaf-statusline.ps1' : 'snaf-statusline.sh';
  const stableName = isWindows ? '.snaf-statusline.ps1' : '.snaf-statusline.sh';
  const srcScript = path.join(__dirname, scriptName);
  const stableScript = path.join(claudeDir, stableName);
  const stableCommand = isWindows
    ? `powershell -ExecutionPolicy Bypass -File "${stableScript}"`
    : `bash "${stableScript}"`;

  fs.copyFileSync(srcScript, stableScript);
  if (!isWindows) {
    try { fs.chmodSync(stableScript, 0o755); } catch (e) {}
  }

  let settings = {};
  if (fs.existsSync(settingsPath)) {
    try { settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')); } catch (e) {}
  }

  const currentCommand = settings.statusLine?.command || '';
  const isSnafStatusline = currentCommand.includes('snaf-statusline');

  if (isSnafStatusline && currentCommand !== stableCommand) {
    const snippet = '"statusLine": { "type": "command", "command": ' + JSON.stringify(stableCommand) + ' }';
    output += '\n\nSTATUSLINE UPDATE AVAILABLE: The snaf statusline command path has changed (plugin was updated). ' +
      'Current path may be stale. New stable path: ' + JSON.stringify(stableCommand) + '. ' +
      'Ask the user if they want to update ~/.claude/settings.json with: ' + snippet + '. ' +
      'Only update if user confirms.';
  } else if (!settings.statusLine) {
    if (!fs.existsSync(statuslineAskedPath)) {
      try { fs.writeFileSync(statuslineAskedPath, '1'); } catch (e) {}
      const snippet = '"statusLine": { "type": "command", "command": ' + JSON.stringify(stableCommand) + ' }';
      output += '\n\nSTATUSLINE SETUP NEEDED: The snaf plugin includes a statusline badge showing [SNAF] when active. ' +
        'It is not configured yet. ' +
        'To enable, add this to ~/.claude/settings.json: ' +
        snippet + ' ' +
        'Proactively offer to set this up for the user on first interaction.';
    }
  }
} catch (e) {
  console.error('snaf: statusline setup failed:', e.message);
}

process.stdout.write(output);
