#!/usr/bin/env node
// snaf — SessionStart activation hook
//
// Runs on every session start:
//   1. Writes flag file at ~/.claude/.snaf-active (statusline reads this)
//   2. Emits snaf ruleset as SessionStart context — reads SKILL.md at runtime
//      so edits to the source of truth propagate automatically, no duplication.
//   3. Detects missing statusline config and emits setup nudge

const fs = require('fs');
const path = require('path');
const os = require('os');
const { getDefaultMode } = require('./snaf-config');

const claudeDir = path.join(os.homedir(), '.claude');
const flagPath = path.join(claudeDir, '.snaf-active');
const settingsPath = path.join(claudeDir, 'settings.json');
const statuslineAskedPath = path.join(claudeDir, '.snaf-statusline-asked');

const mode = getDefaultMode();

// "off" mode — skip activation entirely, don't write flag or emit rules
if (mode === 'off') {
  try { fs.unlinkSync(flagPath); } catch (e) {}
  process.stdout.write('OK');
  process.exit(0);
}

// 1. Write flag file
try {
  fs.mkdirSync(path.dirname(flagPath), { recursive: true });
  fs.writeFileSync(flagPath, mode);
} catch (e) {
  console.error('snaf: flag write failed:', e.message);
}

// 2. Emit snaf ruleset.
//    Reads SKILL.md at runtime so edits propagate automatically — single source of truth.

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
let output = 'SNAF TRYB AKTYWNY\n\n' + body;

// 3. Detect missing statusline config — nudge Claude to help set it up
try {
  let hasStatusline = false;
  if (fs.existsSync(settingsPath)) {
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    if (settings.statusLine) {
      hasStatusline = true;
    }
  }

  if (!hasStatusline && !fs.existsSync(statuslineAskedPath)) {
    try { fs.writeFileSync(statuslineAskedPath, '1'); } catch (e) {}
    const isWindows = process.platform === 'win32';
    const scriptName = isWindows ? 'snaf-statusline.ps1' : 'snaf-statusline.sh';
    const scriptPath = path.join(__dirname, scriptName);
    const command = isWindows
      ? `powershell -ExecutionPolicy Bypass -File "${scriptPath}"`
      : `bash "${scriptPath}"`;
    const statusLineSnippet =
      '"statusLine": { "type": "command", "command": ' + JSON.stringify(command) + ' }';
    output += '\n\nSTATUSLINE SETUP NEEDED: The snaf plugin includes a statusline badge showing [SNAF] when active. ' +
      'It is not configured yet. ' +
      'To enable, add this to ~/.claude/settings.json: ' +
      statusLineSnippet + ' ' +
      'Proactively offer to set this up for the user on first interaction.';
  } else if (!hasStatusline) {
    // already asked, skip nudge
  }
} catch (e) {
  console.error('snaf: statusline detection failed:', e.message);
}

process.stdout.write(output);
