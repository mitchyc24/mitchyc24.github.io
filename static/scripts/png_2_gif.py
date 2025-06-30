# This script converts PNG images to GIF format using the Pillow library.

import os
from PIL import Image

INPUT_DIR = 'static/scripts/input'
OUTPUT_DIR = 'static/scripts/output'

def convert_png_to_gif(png_files, gif_file):
    """
    Convert a list of PNG files to a single GIF file.
    
    :param png_files: List of paths to PNG files.
    :param gif_file: Path where the output GIF file will be saved.
    """
    images = []
    
    for png_file in png_files:
        try:
            img = Image.open(png_file)
            images.append(img.convert('RGBA'))  # Convert to RGBA for transparency support
        except Exception as e:
            print(f"Error opening {png_file}: {e}")
    
    gif_file = os.path.join(OUTPUT_DIR, gif_file)

    if images:
        images[0].save(gif_file, save_all=True, append_images=images[1:], loop=0, duration=1000, disposal=2)
        print(f"GIF saved as {gif_file}")
    else:
        print("No valid PNG files to convert.")

if __name__ == "__main__":
    png_files = [os.path.join(INPUT_DIR, f) for f in os.listdir(INPUT_DIR) if f.lower().endswith('.png')]
    convert_png_to_gif(png_files, 'output.gif')
