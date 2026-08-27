@echo off
REM ===================================================================
REM  The real training run. About 1 hour on an RTX 4060.
REM  Safe to stop with Ctrl-C: resume.bat picks up from models\last.pt.
REM ===================================================================
setlocal
cd /d "%~dp0"

set VPY=.venv\Scripts\python.exe
if not exist "%VPY%" (
    echo ERROR: no .venv here. Run setup.bat first.
REM keep the window open when the script was double-clicked
pause
    exit /b 1
)

REM 200 epochs x 4 augmented views of each of 228 training frames, batch 16.
REM That is ~11k optimiser steps. For scale: 600 steps is enough to fit 2 frames
REM perfectly, and this has to fit 228 under heavy augmentation.
REM
REM --repeats is augmented views per frame per epoch. With 285 frames covering
REM roughly one pose, seeing each frame under 4 different random warps per epoch is
REM what turns a tiny dataset into a usable one.
"%VPY%" tools\train.py ^
    --device cuda ^
    --epochs 200 ^
    --batch 16 ^
    --repeats 4 ^
    --workers 8 ^
    --out models

if errorlevel 1 (
    echo.
    echo Training exited with an error. To continue from the last epoch:  resume.bat
REM keep the window open when the script was double-clicked
pause
    exit /b 1
)

echo.
echo === Done ===
echo.
echo   models\best.pt            ^<-- COPY THIS BACK to the Linux laptop
echo   models\val_montage.png    ^<-- look at it: green = predicted, red = labelled
echo   models\history.jsonl      ^<-- per-epoch metrics
echo.
echo On the Linux laptop, put best.pt in models\ and run:
echo    .venv/bin/python tools/export.py --checkpoint models/best.pt
echo    .venv/bin/python tools/run_app.py -d 4
echo.
echo Export deliberately runs THERE, not here: it benchmarks the OpenVINO devices of
echo the machine that will actually run the app.
echo.
REM keep the window open when the script was double-clicked
pause
exit /b 0
