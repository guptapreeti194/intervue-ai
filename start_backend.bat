@echo off
echo.
echo  InterVue AI — Backend Server
echo  =============================
echo  Starting FastAPI on http://localhost:8000
echo  The ML model will load on first request (or at startup).
echo  First-time model download: ~90 MB (cached after that).
echo.
cd /d "%~dp0backend"
call .venv\Scripts\uvicorn.exe main:app --reload --host 127.0.0.1 --port 8000
