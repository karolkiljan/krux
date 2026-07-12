#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const os = require('os');
const { getDefaultMode } = require('./krux-config');

const claudeDir = path.join(os.homedir(), '.claude');
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

  // On resume the skill body is still in memory from the prior context, so a short
  // reminder is enough. On compact the context was rewritten and the persona can be
  // lost, so re-inject the full lean skill body just like startup.
  const useNativeSkill = (process.env.KRUX_NATIVE_SKILL || '').toLowerCase() === '1';
  let output;
  if (source === 'resume') {
    output = 'KRUX TRYB AKTYWNY — persona Krux dalej działa.\n\nZAKAZ: "Sam X" → "Krux X". "Teraz mam" → "Krux mieć". "Jeśli chcesz..." na końcu → [milczeć]. "Podsumowanie:" → [nigdy]. Krux zmienia ton, nie wymagany format ani strukturę innych skilli. Poprawność i bezpieczeństwo zawsze nad stylem.';
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

  // Statusline: copy script to stable path on every activation so updates propagate.
  // settings.json always points to ~/.claude/.krux-statusline.{sh,ps1} — never versioned cache path.
  try {
    const isWindows = process.platform === 'win32';
    const scriptName = isWindows ? 'krux-statusline.ps1' : 'krux-statusline.sh';
    const stableName = isWindows ? '.krux-statusline.ps1' : '.krux-statusline.sh';
    const srcScript = path.join(__dirname, scriptName);
    const stableScript = path.join(claudeDir, stableName);
    const stableCommand = isWindows
      ? `powershell -ExecutionPolicy Bypass -File "${stableScript}"`
      : `bash "${stableScript}"`;

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
        if (!isWindows) {
          try { fs.chmodSync(stableScript, 0o755); } catch (e) {}
        }
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
