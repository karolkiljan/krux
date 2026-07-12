#!/usr/bin/env node
// krux — shared configuration resolver
//
// Resolution order for default mode:
//   1. ~/.claude/.krux-mode (explicit user choice: "on" or "off")
//   2. KRUX_DEFAULT_MODE environment variable (initial default only)
//   3. 'on'

const fs = require('fs');
const path = require('path');
const os = require('os');

const VALID_MODES = ['on', 'off'];

function getDefaultMode() {
  // 1. Explicit file choice must beat an inherited shell default. Otherwise
  // `stop krux` writes "off", but the next SessionStart silently turns it on.
  try {
    const claudeMode = fs.readFileSync(
      path.join(os.homedir(), '.claude', '.krux-mode'), 'utf8'
    ).trim().toLowerCase();
    if (VALID_MODES.includes(claudeMode)) return claudeMode;
  } catch (e) {}

  // 2. Environment variable supplies the default before the first toggle.
  const envMode = process.env.KRUX_DEFAULT_MODE;
  if (envMode && VALID_MODES.includes(envMode.toLowerCase())) {
    return envMode.toLowerCase();
  }

  // 3. Default
  return 'on';
}

module.exports = { getDefaultMode };
