import sys
import xml.etree.ElementTree as ET
import os
import re

# --- CONFIGURATION ---
ANIMATION_DURATION = '8s'
OUTPUT_FILENAME = 'animated.svg'
INPUT_DIR = 'static/scripts/input'
OUTPUT_DIR = 'static/scripts/output'
# ---------------------

def extract_svg_content(file_path):
    """
    Extract everything between <svg...> and </svg> tags, excluding the outer svg tags themselves.
    """
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Find the opening svg tag and its end
    svg_start = content.find('<svg')
    if svg_start == -1:
        return ""
    
    # Find the end of the opening svg tag
    tag_end = content.find('>', svg_start)
    if tag_end == -1:
        return ""
    
    # Find the closing svg tag
    svg_close = content.rfind('</svg>')
    if svg_close == -1:
        return ""
    
    # Extract content between opening and closing svg tags
    inner_content = content[tag_end + 1:svg_close].strip()
    return inner_content

def get_svg_attributes(file_path):
    """
    Extract attributes from the root SVG element.
    """
    try:
        tree = ET.parse(file_path)
        root = tree.getroot()
        return root.attrib
    except:
        return {}

def combine_svgs(filenames):
    if not filenames:
        print("No SVG files found to combine.")
        return

    # Get attributes from the first SVG
    first_file_path = os.path.join(INPUT_DIR, filenames[0])
    svg_attributes = get_svg_attributes(first_file_path)
    
    # Build the SVG string manually
    svg_content = '<?xml version="1.0" encoding="utf-8"?>\n'
    svg_content += '<svg'
    
    # Add attributes from the first SVG
    for key, value in svg_attributes.items():
        svg_content += f' {key}="{value}"'
    
    # Ensure we have the SVG namespace
    if 'xmlns' not in svg_attributes:
        svg_content += ' xmlns="http://www.w3.org/2000/svg"'
    
    svg_content += '>\n'

    # Add CSS animation styles
    num_frames = len(filenames)
    frame_duration_percent = 100 / num_frames

    svg_content += '<defs><style>\n'
    svg_content += f'''
        .frame {{
            animation-duration: {ANIMATION_DURATION};
            animation-timing-function: steps(1, end);
            animation-iteration-count: infinite;
            visibility: hidden;
        }}
    '''

    for i, filename in enumerate(filenames):
        start_percent = i * frame_duration_percent
        end_percent = (i + 1) * frame_duration_percent
        if i == num_frames - 1:
            end_percent = 100

        animation_name = f'frame-anim-{i}'
        svg_content += f'''
        #frame-{i} {{ animation-name: {animation_name}; }}
        @keyframes {animation_name} {{
            0% {{ visibility: hidden; }}
            {start_percent}% {{ visibility: visible; }}
            {end_percent}% {{ visibility: hidden; }}
            100% {{ visibility: hidden; }}
        }}
        '''
    
    svg_content += '</style></defs>\n'

    # Add each frame as a group with all its content
    for i, filename in enumerate(filenames):
        file_path = os.path.join(INPUT_DIR, filename)
        inner_content = extract_svg_content(file_path)
        
        svg_content += f'<g id="frame-{i}" class="frame">\n'
        svg_content += inner_content + '\n'
        svg_content += '</g>\n'

    svg_content += '</svg>'

    # Write to file
    if not os.path.exists(OUTPUT_DIR):
        os.makedirs(OUTPUT_DIR)
    
    output_path = os.path.join(OUTPUT_DIR, OUTPUT_FILENAME)
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(svg_content)
    
    print(f"✅ Successfully created {OUTPUT_FILENAME} with {num_frames} frames.")

if __name__ == '__main__':
    try:
        svg_files = sorted([f for f in os.listdir(INPUT_DIR) if f.endswith('.svg')])
        if not svg_files:
            print(f"❌ No SVG files found in '{INPUT_DIR}'.")
        else:
            print(f"Found {len(svg_files)} SVG files. Combining...")
            combine_svgs(svg_files)
    except FileNotFoundError:
        print(f"❌ Input directory '{INPUT_DIR}' not found.")