@echo off
setlocal enabledelayedexpansion

:: Always execute from project root directory
cd /d "%~dp0"

echo ============================================================
echo   GhostJob Shield - Setup and Installation
echo ============================================================
echo.

:: 1. Check Python installation
set "PYTHON_CMD="
python --version >nul 2>&1
if %ERRORLEVEL% equ 0 (
    set "PYTHON_CMD=python"
) else (
    py -3 --version >nul 2>&1
    if %ERRORLEVEL% equ 0 (
        set "PYTHON_CMD=py -3"
    )
)

if "%PYTHON_CMD%"=="" (
    echo [ERROR] Python is not installed or not in your PATH.
    echo Please install Python 3.10+ from https://www.python.org/downloads/
    echo NOTE: Ensure you check "Add Python to PATH" during installation.
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('%PYTHON_CMD% --version') do set "PY_VER=%%v"
echo [OK] Found Python: %PY_VER%

:: 2. Check Node.js installation
node --version >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is not installed or not in your PATH.
    echo Please install Node.js 20+ or 22+ from https://nodejs.org/
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('node --version') do set "NODE_VER=%%v"
echo [OK] Found Node.js: %NODE_VER%

:: 3. Check npm installation
call npm --version >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] npm is not installed or not in your PATH.
    echo Please ensure npm is installed alongside Node.js.
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('call npm --version') do set "NPM_VER=%%v"
echo [OK] Found npm: %NPM_VER%
echo.

:: 4. Create Python Virtual Environment (venv)
if not exist "venv" (
    echo [INFO] Creating Python virtual environment in .\venv ...
    %PYTHON_CMD% -m venv venv
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] Failed to create virtual environment.
        pause
        exit /b 1
    )
    echo [OK] Virtual environment created successfully.
) else (
    echo [INFO] Python virtual environment .\venv already exists.
)
echo.

:: 5. Activate Virtual Environment
echo [INFO] Activating virtual environment...
if not exist "venv\Scripts\activate.bat" (
    echo [ERROR] Virtual environment activation script not found at venv\Scripts\activate.bat
    pause
    exit /b 1
)
call venv\Scripts\activate.bat

:: 6. Upgrade pip and install Python dependencies
echo [INFO] Upgrading pip...
python -m pip install --upgrade pip --quiet
echo.

if exist "requirements.txt" (
    echo [INFO] Installing Python dependencies from requirements.txt...
    pip install -r requirements.txt
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] Failed to install Python dependencies.
        pause
        exit /b 1
    )
    echo [OK] Python dependencies installed successfully.
)
echo.

:: 7. Install Node.js dependencies
echo [INFO] Installing Node.js dependencies via npm...
call npm install
if %ERRORLEVEL% neq 0 (
    echo [ERROR] npm install failed.
    pause
    exit /b 1
)
echo [OK] Node.js dependencies installed successfully.
echo.

:: 8. Check and prepare assets if necessary
if not exist "public\media\haunted-job-board-scrub.mp4" (
    if exist "Frontend video.mp4" (
        echo [INFO] Generating scrubbing video: haunted-job-board-scrub.mp4 ...
        call npm run prepare:video
    ) else (
        echo [WARNING] Frontend video.mp4 not found. Skipping video preparation.
    )
)

if not exist "src\data\videoTracking.json" (
    if exist "Frontend video.mp4" (
        echo [INFO] Generating video tracking coordinates...
        python scripts\track-video.py
    )
)

:: 9. Verify production build
echo [INFO] Verifying production build...
call npm run build
if %ERRORLEVEL% neq 0 (
    echo [WARNING] Build check encountered an issue, but dev server may still run.
) else (
    echo [OK] Production build test passed.
)
echo.

echo ============================================================
echo   Setup Complete!
echo ============================================================
echo.
echo All Python dependencies are installed in .\venv
echo All Node.js dependencies are installed in .\node_modules
echo.
echo To launch the system, run:
echo   run.bat
echo.
pause
