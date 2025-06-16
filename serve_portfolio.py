import uvicorn 
from fastapi import FastAPI, HTTPException 
from fastapi.responses import HTMLResponse, FileResponse 
from fastapi.staticfiles import StaticFiles 
import os 
 
app = FastAPI() 

# Main route to serve the single page application
@app.get("/", response_class=HTMLResponse) 
async def get_portfolio(): 
    try: 
        with open("index.html", "r", encoding="utf-8") as file: 
            content = file.read() 
        return content 
    except FileNotFoundError: 
        raise HTTPException(status_code=404, detail="Portfolio page not found") 

# Routes to serve partial content for the SPA
@app.get("/pages/{page_name}", response_class=HTMLResponse)
async def get_page_content(page_name: str):
    try:
        # Validate page name to prevent directory traversal
        if not page_name.endswith(".html") or "/" in page_name or "\\" in page_name:
            raise HTTPException(status_code=400, detail="Invalid page name")
            
        file_path = f"pages/{page_name}"
        with open(file_path, "r", encoding="utf-8") as file:
            content = file.read()
        return content
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Page {page_name} not found")

# Mount the current directory to serve any static files (CSS, JS, images) 
app.mount("/", StaticFiles(directory="static"), name="static") 
 
if __name__ == "__main__": 
    uvicorn.run("serve_portfolio:app", host="0.0.0.0", port=8000, reload=True)
