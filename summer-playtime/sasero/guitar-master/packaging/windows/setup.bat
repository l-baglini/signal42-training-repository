@echo off
REM ===================================================================
REM  FretGuide training setup, Windows + NVIDIA GPU
REM  Creates .venv, installs CUDA PyTorch, verifies the GPU is visible.
REM  Needs an internet connection (about 3 GB of downloads, once).
REM ===================================================================
setlocal

cd /d "%~dp0"
echo.
echo === FretGuide training setup ===
echo Working directory: %CD%
echo.

REM --- find a usable Python -------------------------------------------------
REM torch 2.13.0+cu126 ships Windows wheels for CPython 3.10 - 3.14.
set PY=
for %%V in (3.12 3.13 3.11 3.14 3.10) do (
    if not defined PY (
        py -%%V -c "import sys" >nul 2>&1 && set PY=py -%%V
    )
)
if not defined PY (
    python --version >nul 2>&1 && set PY=python
)
if not defined PY (
    echo ERROR: no Python found.
    echo Install Python 3.12 from https://www.python.org/downloads/
    echo Tick "Add python.exe to PATH" in the installer.
REM keep the window open when the script was double-clicked
pause
    exit /b 1
)

echo Using: %PY%
%PY% --version
echo.

REM --- virtual environment --------------------------------------------------
if exist .venv (
    echo .venv already exists, reusing it.
) else (
    echo Creating .venv ...
    %PY% -m venv .venv
    if errorlevel 1 (
        echo ERROR: could not create the virtual environment.
REM keep the window open when the script was double-clicked
pause
        exit /b 1
    )
)

set VPY=.venv\Scripts\python.exe
if not exist "%VPY%" (
    echo ERROR: %VPY% missing. Delete the .venv folder and run this again.
REM keep the window open when the script was double-clicked
pause
    exit /b 1
)

"%VPY%" -m pip install --upgrade pip --quiet
if errorlevel 1 goto :pipfail

REM --- CUDA PyTorch, from PyTorch's own index -------------------------------
REM cu126 is the newest index with Windows wheels (torch 2.13.0) and covers the
REM 4060's Ada architecture (compute capability 8.9). Plain "pip install torch"
REM on Windows would fetch the CPU-only build instead.
echo.
echo Installing CUDA PyTorch (large download, be patient) ...
"%VPY%" -m pip install torch --index-url https://download.pytorch.org/whl/cu126
if errorlevel 1 goto :pipfail

echo.
echo Installing the rest ...
"%VPY%" -m pip install -r requirements-train.txt
if errorlevel 1 goto :pipfail

REM --- verify the GPU is actually going to be used --------------------------
echo.
echo === Checking CUDA ===
"%VPY%" -c "import torch; ok=torch.cuda.is_available(); print('torch', torch.__version__); print('CUDA available:', ok); print('GPU:', torch.cuda.get_device_name(0) if ok else 'NONE'); raise SystemExit(0 if ok else 3)"
if errorlevel 3 (
    echo.
    echo WARNING: PyTorch cannot see your GPU. Training will fall back to the CPU
    echo and take many hours instead of about one.
    echo   - update your NVIDIA driver, then run this script again
    echo   - a reboot after a driver update is often what fixes it
REM keep the window open when the script was double-clicked
pause
    exit /b 3
)
if errorlevel 1 goto :pipfail

echo.
echo === Setup complete ===
echo.
echo Next:
echo    verify.bat     run the test suite and a 2-epoch smoke test  (about 2 minutes)
echo    train.bat      the real run                                 (about 1 hour)
echo.
REM keep the window open when the script was double-clicked
pause
exit /b 0

:pipfail
echo.
echo ERROR: a pip install failed. Scroll up for the reason.
echo If it was a network timeout, just run setup.bat again -- it resumes.
REM keep the window open when the script was double-clicked
pause
exit /b 1
