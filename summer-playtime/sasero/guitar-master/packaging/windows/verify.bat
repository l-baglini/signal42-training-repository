@echo off
REM ===================================================================
REM  Prove the bundle works BEFORE committing an hour to training.
REM  Runs the test suite, then two real epochs on a handful of frames.
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

echo.
echo === 1/4  GPU ===
"%VPY%" -c "import torch; ok=torch.cuda.is_available(); print('torch', torch.__version__, '| CUDA', ok, '|', torch.cuda.get_device_name(0) if ok else 'CPU ONLY')"

echo.
echo === 2/4  Test suite (no GPU needed, ~10 s) ===
REM 170 tests. The load-bearing one is test_perfect_heatmaps_meet_the_accuracy_budget:
REM if that fails, the representation itself is broken and training cannot fix it.
"%VPY%" -m pytest tests -q
if errorlevel 1 (
    echo.
    echo ERROR: tests failed. Do not train on this; something is wrong with the bundle.
REM keep the window open when the script was double-clicked
pause
    exit /b 1
)

echo.
echo === 3/4  Dataset ===
"%VPY%" -c "from fretguide.dataset import load_dataset, split_by_capture_order; import numpy as np; f=load_dataset('dataset/frames','dataset/labels.json'); a=np.array([x.across_px for x in f]); tr,va=split_by_capture_order(f); print(f'{len(f)} labelled frames -> train {len(tr)}, val {len(va)}'); print(f'label across-wire error: median {np.median(a):.2f} px, p90 {np.percentile(a,90):.2f} px (at 1920 wide)')"
if errorlevel 1 (
    echo.
    echo ERROR: the dataset did not load. Is dataset\frames\ populated?
REM keep the window open when the script was double-clicked
pause
    exit /b 1
)

echo.
echo === 4/4  Two real epochs on 24 frames (~1 min on the GPU) ===
"%VPY%" tools\train.py --limit 24 --epochs 2 --batch 4 --repeats 1 --workers 2 --device cuda --out smoke
if errorlevel 1 (
    echo.
    echo ERROR: training crashed. Scroll up for the traceback.
REM keep the window open when the script was double-clicked
pause
    exit /b 1
)

echo.
echo === All checks passed ===
echo Two epochs is far too few to place any dots -- "posed 0%%" here is expected
echo and not a failure. What it proves is that the whole loop runs on your GPU.
echo.
echo Now run:  train.bat
echo.
REM keep the window open when the script was double-clicked
pause
exit /b 0
