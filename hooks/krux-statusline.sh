#!/usr/bin/env bash
# krux — statusline badge
# Reads ~/.claude/.krux-active flag and prints [KRUX] when active.
# Add to ~/.claude/settings.json:
#   "statusLine": { "type": "command", "command": "bash /path/to/krux-statusline.sh" }

FLAG="$HOME/.claude/.krux-active"

if [ -f "$FLAG" ]; then
  echo "[KRUX]"
fi
