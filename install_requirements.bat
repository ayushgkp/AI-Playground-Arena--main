@echo off
REM Install either lightweight or full dependencies.
IF "%1"=="full" (
    echo Installing FULL requirements (this may take a long time)...
    pip install --upgrade pip
    pip install -r requirements_full.txt
) ELSE (
    echo Installing LITE requirements (fast) ...
    pip install --upgrade pip
    pip install -r requirements_lite.txt
)
echo Done.
pause