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
echo app.mount("/", StaticFiles(directory="."), name="static") >> serve_portfolio.py
echo. >> serve_portfolio.py
echo if __name__ == "__main__": >> serve_portfolio.py
echo     uvicorn.run("serve_portfolio:app", host="0.0.0.0", port=8000, reload=True) >> serve_portfolio.py

:: Run the server
echo Starting portfolio site on LAN at http://%LOCAL_IP%:8000
echo Other devices on your network can access your portfolio at this address
echo Local access: http://127.0.0.1:8000
echo Press Ctrl+C to stop the server
python serve_portfolio.py

:: Clean up the temporary file when done
del serve_portfolio.py

pause
