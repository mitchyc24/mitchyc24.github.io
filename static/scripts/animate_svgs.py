import sys
import xml.etree.ElementTree as ET
import os

# --- CONFIGURATION ---
ANIMATION_DURATION = '2s'
OUTPUT_FILENAME = 'animated.svg'
INPUT_DIR = 'static/scripts/input'
OUTPUT_DIR = 'static/scripts/output'
# ---------------------

def combine_svgs(filename1, filename2):
    # Register the SVG namespace to preserve it on output
    ET.register_namespace('', "http://www.w3.org/2000/svg")

    file1_path = os.path.join(INPUT_DIR, filename1)
    file2_path = os.path.join(INPUT_DIR, filename2)
    # Parse the input files
    tree1 = ET.parse(file1_path)
    root1 = tree1.getroot()
    tree2 = ET.parse(file2_path)
    root2 = tree2.getroot()

    # Create the new root SVG element, copying attributes from the first file
    final_root = ET.Element('svg', attrib=root1.attrib)

    # Create defs and style elements
    defs = ET.SubElement(final_root, 'defs')
    style = ET.SubElement(defs, 'style')
    style.text = f"""
        #frame-on {{ visibility: hidden; }}
        #frame-off, #frame-on {{
          animation-duration: {ANIMATION_DURATION};
          animation-timing-function: steps(1, end);
          animation-iteration-count: infinite;
        }}
        #frame-off {{ animation-name: toggle-off; }}
        #frame-on {{ animation-name: toggle-on; }}
        @keyframes toggle-off {{
          0% {{ visibility: visible; }}
          50%, 100% {{ visibility: hidden; }}
        }}
        @keyframes toggle-on {{
          0% {{ visibility: hidden; }}
          50%, 100% {{ visibility: visible; }}
        }}
    """

    # Create frame groups
    frame_off = ET.SubElement(final_root, 'g', attrib={'id': 'frame-off'})
    frame_on = ET.SubElement(final_root, 'g', attrib={'id': 'frame-on'})

    # Function to get visual elements
    def get_visual_elements(root_element):
        visuals = []
        for child in root_element:
            # The tag is returned with namespace in curly braces, so we check the local name
            if child.tag.split('}')[-1] not in ['defs', 'metadata', 'style']:
                visuals.append(child)
        return visuals

    # Populate frames
    for child in get_visual_elements(root1):
        frame_off.append(child)
    for child in get_visual_elements(root2):
        frame_on.append(child)

    # Write to file
    final_tree = ET.ElementTree(final_root)
    final_tree.write(os.path.join(OUTPUT_DIR, OUTPUT_FILENAME), encoding='utf-8', xml_declaration=True)
    print(f"✅ Successfully created {OUTPUT_FILENAME}")


if __name__ == '__main__':
    if len(sys.argv) != 3:
        print("❌ Please provide two SVG files as arguments.")
        print("Usage: python animate_svgs.py frame1.svg frame2.svg")
    else:
        combine_svgs(sys.argv[1], sys.argv[2])