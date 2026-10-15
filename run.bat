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

:: 2. Check for .env file
if not exist ".env" (
    echo [WARNING] .env file not found. Creating from .env.example
    copy /Y ".env.example" ".env" >nul
    echo [INFO] Created .env -- edit it to add your TINYFISH_API_KEY before scanning live URLs.
    echo.
)

:: 3. Activate virtual environment
echo [INFO] Activating virtual environment...
call venv\Scripts\activate.bat

:: 4. Check for prepared scrubbing video
if not exist "public\media\haunted-job-board-scrub.mp4" (
    if exist "Frontend video.mp4" (
        echo [INFO] Scrubbing video not found. Preparing video...
        call npm run prepare:video
    )
)

:: 5. Free ports from any stale processes
echo [INFO] Checking for stale processes on ports 5173 and 3001...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":5173 " ^| findstr "LISTEN" 2^>nul') do (
    echo [INFO] Killing stale process on port 5173, PID %%p
    taskkill /PID %%p /F >nul 2>&1
)
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":3001 " ^| findstr "LISTEN" 2^>nul') do (
    echo [INFO] Killing stale process on port 3001, PID %%p
    taskkill /PID %%p /F >nul 2>&1
)

:: 6. Start the API server in a separate window
echo [INFO] Starting API server on port 3001...
start "GhostShield API" cmd /k "cd /d "%~dp0" && npm run dev:api"

:: Give the API a moment to start
timeout /t 2 /nobreak >nul

:: 7. Start Vite development server
echo [INFO] Starting frontend development server...
echo.
echo   API:      http://127.0.0.1:3001
echo   Frontend: http://127.0.0.1:5173
echo.
echo Press Ctrl+C in this terminal window to stop the frontend.
echo Close the "GhostShield API" window to stop the API.
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
