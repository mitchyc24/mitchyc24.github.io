import uvicorn
from starlette.applications import Starlette
from starlette.staticfiles import StaticFiles

# Assumes your static files (like index.html) are in the same directory
# as this script. If they are in a subdirectory (e.g., "_site"),
# change `directory` to `directory="_site"`.
app = Starlette(debug=True)
app.mount('/', StaticFiles(directory='.', html=True), name='static')

if __name__ == "__main__":
    print("Serving at http://localhost:8000")
    uvicorn.run(app, host="0.0.0.0", port=8000)
