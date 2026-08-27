@echo off
REM Continue an interrupted run from models\last.pt (written every epoch).
setlocal
cd /d "%~dp0"

set VPY=.venv\Scripts\python.exe
if not exist "%VPY%" (
    echo ERROR: no .venv here. Run setup.bat first.
REM keep the window open when the script was double-clicked
pause
    exit /b 1
)
if not exist models\last.pt (
    echo No models\last.pt to resume from. Start fresh with train.bat.
REM keep the window open when the script was double-clicked
pause
    exit /b 1
)

"%VPY%" tools\train.py ^
    --device cuda ^
    --epochs 200 ^
    --batch 16 ^
    --repeats 4 ^
    --workers 8 ^
    --out models ^
    --resume models\last.pt
