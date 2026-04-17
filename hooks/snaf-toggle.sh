#!/usr/bin/env bash
INPUT=$(cat)
PROMPT=$(echo "$INPUT" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('prompt',''))" 2>/dev/null)
if [ $? -ne 0 ]; then
  exit 0
fi

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
