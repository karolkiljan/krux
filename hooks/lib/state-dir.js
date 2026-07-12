#!/usr/bin/env node
// krux — wspólny resolver katalogu stanu dla wszystkich hooków.
// PLUGIN_DATA (ustawiane przez Codex CLI) = host-neutralny, zapisywalny
// katalog per-plugin. Brak PLUGIN_DATA = Claude Code, dzisiejsze ~/.claude/.

const path = require('path');
const os = require('os');

function stateDir() {
  return process.env.PLUGIN_DATA || path.join(os.homedir(), '.claude');
}

module.exports = { stateDir };
