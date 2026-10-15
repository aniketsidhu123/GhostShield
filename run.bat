@echo off
setlocal enabledelayedexpansion

:: Always execute from project root directory
cd /d "%~dp0"

echo ============================================================
echo   GhostJob Shield - The Haunted Job Board
echo ============================================================
echo.

:: 1. Verify that setup has been completed
if not exist "venv\Scripts\activate.bat" (
    echo [ERROR] Python virtual environment not found in .\venv
    echo Please run 'setup.bat' first to set up the project.
    echo.
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo [ERROR] Node.js dependencies not found in .\node_modules
    echo Please run 'setup.bat' first to install packages.
    echo.
    pause
    exit /b 1
)

:: 2. Activate virtual environment
echo [INFO] Activating virtual environment (venv)...
call venv\Scripts\activate.bat

:: 3. Check for prepared scrubbing video
if not exist "public\media\haunted-job-board-scrub.mp4" (
    if exist "Frontend video.mp4" (
        echo [INFO] Scrubbing video not found. Preparing video...
        call npm run prepare:video
    )
)

:: 4. Start Vite development server
echo [INFO] Starting GhostJob Shield development server...
echo Local address: http://127.0.0.1:5173
echo Press Ctrl+C in this terminal window to stop the server.
echo.

if "%~1"=="" (
    call npm run dev -- --open
) else (
    call npm run dev -- %*
)

if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] Server exited with code %ERRORLEVEL%.
    pause
)
