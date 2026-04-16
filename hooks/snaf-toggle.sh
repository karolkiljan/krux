#!/usr/bin/env bash
if ! command -v jq >/dev/null 2>&1; then
  echo "snaf-toggle: jq not installed — toggle disabled" >&2
  exit 0
fi
PROMPT=$(jq -r '.prompt // ""')
CLAUDE_DIR="$HOME/.claude"
mkdir -p "$CLAUDE_DIR"
MODE_FILE="$CLAUDE_DIR/.snaf-mode"
FLAG="$CLAUDE_DIR/.snaf-active"

write_off() {
  printf 'off' > "$MODE_FILE"
  rm -f "$FLAG"
}

write_on() {
  printf 'on' > "$MODE_FILE"
  touch "$FLAG"
}

if echo "$PROMPT" | grep -qiE '^(stop snaf|normalny tryb|wyłącz snaf)[[:space:]]*$'; then
  write_off
elif echo "$PROMPT" | grep -qiE '^(snaf|włącz snaf|start snaf|aktywuj snaf)[[:space:]]*$'; then
  write_on
fi
