# This script converts PNG images to GIF format using the Pillow library.

import os
from PIL import Image

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
    
    if images:
        images[0].save(gif_file, save_all=True, append_images=images[1:], loop=0, duration=500)
        print(f"GIF saved as {gif_file}")
    else:
        print("No valid PNG files to convert.")