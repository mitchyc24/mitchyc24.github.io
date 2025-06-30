import sys
import xml.etree.ElementTree as ET
import os

# --- CONFIGURATION ---
ANIMATION_DURATION = '2s'
OUTPUT_FILENAME = 'animated.svg'
INPUT_DIR = 'static/scripts/input'
OUTPUT_DIR = 'static/scripts/output'
# ---------------------

def combine_svgs(filenames):
    if not filenames:
        print("No SVG files found to combine.")
        return

    # Register the SVG namespace to preserve it on output
    ET.register_namespace('', "http://www.w3.org/2000/svg")

    # Use the first file to set up the base SVG element
    first_file_path = os.path.join(INPUT_DIR, filenames[0])
    tree1 = ET.parse(first_file_path)
    root1 = tree1.getroot()
    final_root = ET.Element('svg', attrib=root1.attrib)

    # Create defs and style elements
    defs = ET.SubElement(final_root, 'defs')
    style = ET.SubElement(defs, 'style')

    num_frames = len(filenames)
    frame_duration_percent = 100 / num_frames

    style_text = f"""
        .frame {{
            animation-duration: {ANIMATION_DURATION};
            animation-timing-function: steps(1, end);
            animation-iteration-count: infinite;
            visibility: hidden;
        }}
    """

    for i, filename in enumerate(filenames):
        start_percent = i * frame_duration_percent
        end_percent = (i + 1) * frame_duration_percent
        # Make the last frame extend to 100%
        if i == num_frames - 1:
            end_percent = 100

        animation_name = f'frame-anim-{i}'
        style_text += f"""
        #frame-{i} {{ animation-name: {animation_name}; }}
        @keyframes {animation_name} {{
            0% {{ visibility: hidden; }}
            {start_percent}% {{ visibility: visible; }}
            {end_percent}% {{ visibility: hidden; }}
            100% {{ visibility: hidden; }}
        }}
        """
    style.text = style_text

    # Function to get visual elements from an SVG root
    def get_visual_elements(root_element):
        visuals = []
        for child in root_element:
            if child.tag.split('}')[-1] not in ['defs', 'metadata', 'style']:
                visuals.append(child)
        return visuals

    # Create and populate frames
    for i, filename in enumerate(filenames):
        frame_group = ET.SubElement(final_root, 'g', attrib={'id': f'frame-{i}', 'class': 'frame'})
        
        file_path = os.path.join(INPUT_DIR, filename)
        tree = ET.parse(file_path)
        root = tree.getroot()
        
        for child in get_visual_elements(root):
            frame_group.append(child)

    # Write to file
    if not os.path.exists(OUTPUT_DIR):
        os.makedirs(OUTPUT_DIR)
    final_tree = ET.ElementTree(final_root)
    final_tree.write(os.path.join(OUTPUT_DIR, OUTPUT_FILENAME), encoding='utf-8', xml_declaration=True)
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