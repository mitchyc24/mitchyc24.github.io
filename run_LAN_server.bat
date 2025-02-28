@echo off
echo Starting local server for resume.html...

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

:: Create a temporary Python file to serve the HTML
echo import uvicorn > serve_resume.py
echo from fastapi import FastAPI, HTTPException >> serve_resume.py
echo from fastapi.responses import HTMLResponse, FileResponse >> serve_resume.py
echo from fastapi.staticfiles import StaticFiles >> serve_resume.py
echo import os >> serve_resume.py
echo. >> serve_resume.py
echo app = FastAPI() >> serve_resume.py
echo. >> serve_resume.py
echo @app.get("/", response_class=HTMLResponse) >> serve_resume.py
echo async def get_resume(): >> serve_resume.py
echo     try: >> serve_resume.py
echo         with open("resume.html", "r", encoding="utf-8") as file: >> serve_resume.py
echo             content = file.read() >> serve_resume.py
echo         return content >> serve_resume.py
echo     except FileNotFoundError: >> serve_resume.py
echo         raise HTTPException(status_code=404, detail="Resume file not found") >> serve_resume.py
echo. >> serve_resume.py
echo # Mount the current directory to serve any static files (CSS, JS, images) >> serve_resume.py
echo app.mount("/", StaticFiles(directory="."), name="static") >> serve_resume.py
echo. >> serve_resume.py
echo if __name__ == "__main__": >> serve_resume.py
echo     uvicorn.run("serve_resume:app", host="0.0.0.0", port=8000, reload=True) >> serve_resume.py

:: Run the server
echo Starting server on LAN at http://%LOCAL_IP%:8000
echo Other devices on your network can access your resume at this address
echo Local access: http://127.0.0.1:8000
echo Press Ctrl+C to stop the server
python serve_resume.py

:: Clean up the temporary file when done
del serve_resume.py

pause
