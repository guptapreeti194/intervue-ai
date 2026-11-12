Write-Host ""
Write-Host " InterVue AI — Backend Server" -ForegroundColor Cyan
Write-Host " =============================" -ForegroundColor Cyan
Write-Host " Starting on http://localhost:8000" -ForegroundColor White
Write-Host ""

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location "$scriptDir\backend"

& ".\.venv\Scripts\uvicorn.exe" main:app --reload --host 127.0.0.1 --port 8000
