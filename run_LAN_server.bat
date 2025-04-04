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

:: Get local IP address with improved detection
echo Detecting your local IP address...
set LOCAL_IP=Not detected

:: Try to find IPv4 address
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4 Address"') do (
    set LOCAL_IP=%%a
    set LOCAL_IP=!LOCAL_IP:~1!
    echo Found IP address: %LOCAL_IP%
)

:: If not found, look for "IP Address" (older systems)
if "%LOCAL_IP%"=="Not detected" (
    for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IP Address"') do (
        set LOCAL_IP=%%a
        set LOCAL_IP=!LOCAL_IP:~1!
        echo Found IP address: %LOCAL_IP%
    )
)

:: Enable delayed expansion for variables
setlocal enabledelayedexpansion

echo Your local IP address is: %LOCAL_IP%
echo.
echo Note: This is a valid private IP address. Networks can use either:
echo  - 10.0.0.0 to 10.255.255.255 (10.0.0.0/8)
echo  - 172.16.0.0 to 172.31.255.255 (172.16.0.0/12)
echo  - 192.168.0.0 to 192.168.255.255 (192.168.0.0/16)
echo.

:: Create a temporary Python file to serve the site
echo import uvicorn > serve_portfolio.py
echo from fastapi import FastAPI, HTTPException >> serve_portfolio.py
echo from fastapi.responses import HTMLResponse, FileResponse >> serve_portfolio.py
echo from fastapi.staticfiles import StaticFiles >> serve_portfolio.py
echo import os >> serve_portfolio.py
echo. >> serve_portfolio.py
echo app = FastAPI() >> serve_portfolio.py
echo. >> serve_portfolio.py
echo @app.get("/", response_class=HTMLResponse) >> serve_portfolio.py
echo async def get_portfolio(): >> serve_portfolio.py
echo     try: >> serve_portfolio.py
echo         with open("index.html", "r", encoding="utf-8") as file: >> serve_portfolio.py
echo             content = file.read() >> serve_portfolio.py
echo         return content >> serve_portfolio.py
echo     except FileNotFoundError: >> serve_portfolio.py
echo         raise HTTPException(status_code=404, detail="Portfolio page not found") >> serve_portfolio.py
echo. >> serve_portfolio.py
echo # Mount the current directory to serve any static files (CSS, JS, images) >> serve_portfolio.py
echo app.mount("/", StaticFiles(directory=".", html=True), name="static") >> serve_portfolio.py
echo. >> serve_portfolio.py
echo if __name__ == "__main__": >> serve_portfolio.py
echo     uvicorn.run("serve_portfolio:app", host="0.0.0.0", port=8000, reload=True) >> serve_portfolio.py

:: Run the server
echo Starting portfolio site on LAN at http://%LOCAL_IP%:8000
echo Other devices on your network can access your portfolio at this address
echo.
echo Troubleshooting tips:
echo 1. Make sure your devices are on the same network
echo 2. Try disabling firewalls temporarily for testing 
echo 3. Some networks may restrict device-to-device communication
echo.
echo Local access: http://127.0.0.1:8000
echo Press Ctrl+C to stop the server
python serve_portfolio.py

:: Clean up the temporary file when done
del serve_portfolio.py

pause
