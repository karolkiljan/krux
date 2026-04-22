# krux — statusline badge (Windows/PowerShell)
# Reads ~/.claude/.krux-active flag and prints [KRUX] when active.
# Add to ~/.claude/settings.json:
#   "statusLine": { "type": "command", "command": "powershell -ExecutionPolicy Bypass -File /path/to/krux-statusline.ps1" }

$flagPath = Join-Path $HOME ".claude\.krux-active"

if (Test-Path $flagPath) {
  Write-Output "[KRUX]"
}
