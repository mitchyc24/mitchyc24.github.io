import uvicorn 
from fastapi import FastAPI, HTTPException 
from fastapi.responses import HTMLResponse, FileResponse 
from fastapi.staticfiles import StaticFiles 
import os 
import urllib.request
import json
 
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

# New endpoint to fetch Lichess ratings
@app.get("/api/lichess-rating/{username}")
async def get_lichess_rating(username: str):
    """
    Fetches Lichess user ratings given a username.
    """
    url = f"https://lichess.org/api/user/{username}"
    try:
        with urllib.request.urlopen(url) as response:
            data = response.read().decode()
            user_data = json.loads(data)
            perfs = user_data.get("perfs", {})
            
            # Extract relevant rating information
            ratings = {}
            for game_type, rating_info in perfs.items():
                if isinstance(rating_info, dict) and 'rating' in rating_info:
                    ratings[game_type] = {
                        'rating': rating_info.get('rating'),
                        'games': rating_info.get('games', 0),
                        'rd': rating_info.get('rd', 0)
                    }
            
            return {
                'username': username,
                'ratings': ratings,
                'profile': {
                    'country': user_data.get('profile', {}).get('country'),
                    'location': user_data.get('profile', {}).get('location')
                }
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching data for {username}: {str(e)}")

# Mount the 'static' directory to serve static files (CSS, JS, images) under the '/static' path
app.mount("/static", StaticFiles(directory="static"), name="static")
 
if __name__ == "__main__": 
    uvicorn.run("serve_portfolio:app", host="0.0.0.0", port=8000, reload=True)
