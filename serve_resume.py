import uvicorn 
from fastapi import FastAPI, HTTPException 
from fastapi.responses import HTMLResponse, FileResponse 
from fastapi.staticfiles import StaticFiles 
import os 
 
app = FastAPI() 
 
@app.get("/", response_class=HTMLResponse) 
async def get_resume(): 
    try: 
        with open("resume.html", "r", encoding="utf-8") as file: 
            content = file.read() 
        return content 
    except FileNotFoundError: 
        raise HTTPException(status_code=404, detail="Resume file not found") 
 
# Mount the current directory to serve any static files (CSS, JS, images) 
app.mount("/", StaticFiles(directory="."), name="static") 
 
if __name__ == "__main__": 
    uvicorn.run("serve_resume:app", host="0.0.0.0", port=8000, reload=True) 
