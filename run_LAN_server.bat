@echo off
echo Starting local portfolio server...

:: Check if Python is installed
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo Python is not installed or not in PATH. Please install Python first.
    pause
    exit /b 1
)

:: Check if uvicorn is installed, if not install it
pip show uvicorn >nul 2>&1
if %errorlevel% neq 0 (
    echo Installing uvicorn...
    pip install uvicorn fastapi
    if %errorlevel% neq 0 (
        echo Failed to install uvicorn. Please install it manually with: pip install uvicorn fastapi
        pause
        exit /b 1
    )
)

:: Get local IP address
echo Detecting your local IP address...
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4 Address"') do (
    set LOCAL_IP=%%a
    goto :found_ip
)
:found_ip
set LOCAL_IP=%LOCAL_IP:~1%
echo Your local IP address is: %LOCAL_IP%


:: Run the server
echo Starting portfolio site on LAN at http://%LOCAL_IP%:8000
echo Other devices on your network can access your portfolio at this address
echo Local access: http://127.0.0.1:8000
echo Press Ctrl+C to stop the server
python serve_portfolio.py

:: Clean up the temporary file when done
del serve_portfolio.py

pause
