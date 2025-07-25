import os
import glob
from PIL import Image

def resize_png_files():
    """Resize all PNG files in the current directory to 64x64 pixels."""
    # Find all PNG files in the current directory
    png_files = glob.glob("*.png")
    
    if not png_files:
        print("No PNG files found in the current directory.")
        return
    
    print(f"Found {len(png_files)} PNG file(s) to resize...")
    
    for filename in png_files:
        try:
            # Open the image
            with Image.open(filename) as img:
                # Resize to 64x64 pixels
                resized_img = img.resize((64, 64), Image.Resampling.LANCZOS)
                
                # Save back to the same filename (overwrites original)
                resized_img.save(filename)
                print(f"Resized: {filename}")
                
        except Exception as e:
            print(f"Error processing {filename}: {e}")
    
    print("Resize operation completed.")

if __name__ == "__main__":
    resize_png_files()
