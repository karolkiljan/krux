@echo off
where python3 >nul 2>nul
if %errorlevel%==0 (
  python3 "%~dp0snaf-detect-settings" %*
) else (
  python "%~dp0snaf-detect-settings" %*
)
