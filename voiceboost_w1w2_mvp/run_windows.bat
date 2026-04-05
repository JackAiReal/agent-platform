@echo off
setlocal
cd /d %~dp0

if not exist .venv (
  py -3 -m venv .venv
)

call .venv\Scripts\activate.bat
python -m pip install --upgrade pip >nul
python -m pip install -r requirements.txt >nul

if "%HOST%"=="" set HOST=0.0.0.0
if "%PORT%"=="" set PORT=8010

echo VoiceBoost W1-W2 MVP running at http://%HOST%:%PORT%
python -m uvicorn app.main:app --host %HOST% --port %PORT%
