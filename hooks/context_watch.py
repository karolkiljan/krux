import json
import sys
import os
import time

data = json.load(sys.stdin)
session_id = data.get("session_id", "")
threshold = int(os.environ.get("SNAF_CONTEXT_THRESHOLD", "30000"))
cooldown = int(os.environ.get("SNAF_CONTEXT_COOLDOWN", "300"))

cwd = os.getcwd()
project_key = cwd.replace("/", "-")
project_dir = os.path.expanduser("~/.claude/projects/" + project_key)
jsonl = os.path.join(project_dir, session_id + ".jsonl")

if not os.path.exists(jsonl):
    sys.exit(0)

cooldown_file = os.path.join(project_dir, session_id + ".context_watch_ts")
if os.path.exists(cooldown_file):
    with open(cooldown_file) as f:
        last_fired = float(f.read().strip())
    if time.time() - last_fired < cooldown:
        sys.exit(0)

last_tokens = 0
with open(jsonl) as f:
    for line in f:
        try:
            d = json.loads(line)
            usage = d.get("message", {}).get("usage") or d.get("usage")
            if usage and "cache_read_input_tokens" in usage:
                last_tokens = usage["cache_read_input_tokens"]
        except Exception:
            pass

if last_tokens > threshold:
    with open(cooldown_file, "w") as f:
        f.write(str(time.time()))
    print(
        f"[CONTEXT_WATCH] Context osiągnął {last_tokens} tokenów (próg: {threshold}). "
        "Uruchom context watch protocol ze SKILL.md: wyświetl orkowy komunikat "
        "i zapytaj użytkownika co zachować przed /compact."
    )
    sys.exit(2)
