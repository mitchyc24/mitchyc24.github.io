import os
import requests
import json
from PIL import Image
from io import BytesIO
import argparse
import sys

class NasaImageManager:
    """
    A class to manage fetching, storing, and processing image metadata from the NASA EPIC API.
    """

    def __init__(self, api_base_url="https://epic.gsfc.nasa.gov/api", data_folder="nasa_data"):
        """
        Initializes the NasaImageManager.

        Args:
            api_base_url (str): The base URL for the NASA EPIC API.
            data_folder (str): The name of the folder to store JSON metadata files.
        """
        self.api_base_url = api_base_url
        self.data_folder = data_folder
        if not os.path.exists(self.data_folder):
            os.makedirs(self.data_folder)

    def fetch_metadata(self, image_type="natural", date=None):
        """
        Fetches image metadata from the NASA EPIC API and saves it to a JSON file.

        Args:
            image_type (str): The type of imagery to fetch (e.g., 'natural', 'enhanced').
            date (str, optional): The date for which to fetch imagery in YYYY-MM-DD format.
                                  If None, fetches the most recent data.

        Returns:
            str: The file path of the saved JSON data, or None if the request fails.
        """
        if date:
            url = f"{self.api_base_url}/{image_type}/date/{date}"
            filename = f"{image_type}_{date.replace('-', '_')}.json"
        else:
            url = f"{self.api_base_url}/{image_type}"
            filename = f"{image_type}_latest.json"

        try:
            response = requests.get(url)
            response.raise_for_status()  # Raise an exception for bad status codes
            data = response.json()
            filepath = os.path.join(self.data_folder, filename)
            with open(filepath, 'w') as f:
                json.dump(data, f, indent=4)
            print(f"Successfully fetched and saved metadata to {filepath}")
            return filepath
        except requests.exceptions.RequestException as e:
            print(f"Error fetching metadata: {e}")
            return None

    def parse_metadata(self, filepath):
        """
        Parses a JSON metadata file.

        Args:
            filepath (str): The path to the JSON file.

        Returns:
            list: A list of dictionaries, where each dictionary contains metadata for an image.
                  Returns an empty list if the file cannot be read or is not valid JSON.
        """
        try:
            with open(filepath, 'r') as f:
                data = json.load(f)
            return data
        except (FileNotFoundError, json.JSONDecodeError) as e:
            print(f"Error parsing metadata file {filepath}: {e}")
            return []

    def construct_image_url(self, metadata_item, image_format="png", collection="natural"):
        """
        Constructs the full URL for an image based on its metadata.

        Args:
            metadata_item (dict): A dictionary containing the metadata for a single image.
            image_format (str): The desired image format ('png', 'jpg', 'thumbs').
            collection (str): The collection type ('natural', 'enhanced', etc.).

        Returns:
            str: The full URL to the image.
        """
        image_name = metadata_item['image']
        date_str = metadata_item['date']
        year, month, day = date_str.split(' ')[0].split('-')
        archive_base_url = "https://epic.gsfc.nasa.gov/archive"
        # Map thumbs to jpg extension
        ext = 'jpg' if image_format == 'thumbs' else image_format
        image_url = f"{archive_base_url}/{collection}/{year}/{month}/{day}/{image_format}/{image_name}.{ext}"
        return image_url

    def fetch_image(self, image_url):
        """
        Fetches an image from a given URL.

        Args:
            image_url (str): The URL of the image to fetch.

        Returns:
            bytes: The image content as bytes, or None if the request fails.
        """
        try:
            response = requests.get(image_url)
            response.raise_for_status()
            print(f"Successfully fetched image from {image_url}")
            return response.content
        except requests.exceptions.RequestException as e:
            print(f"Error fetching image: {e}")
            return None

    def process_image(self, image_data):
        """
        A placeholder function to demonstrate processing an image.
        This example opens the image and prints its size.

        Args:
            image_data (bytes): The byte content of the image.
        """
        if image_data:
            try:
                image = Image.open(BytesIO(image_data))
                print(f"Processing image... Format: {image.format}, Size: {image.size}")
                # Here you would add your actual image processing logic
                # For example, you could resize it, apply filters, or run analysis.
                # image.show() # Uncomment to display the image
            except IOError as e:
                print(f"Error processing image data: {e}")

    # NEW: helper to compute default metadata path for a type/date
    def default_metadata_path(self, image_type: str, date: str | None):
        if date:
            filename = f"{image_type}_{date.replace('-', '_')}.json"
        else:
            filename = f"{image_type}_latest.json"
        return os.path.join(self.data_folder, filename)

    # NEW: generate image URLs from a parsed metadata list
    def generate_image_urls(self, metadata_list, image_format="png", collection="natural"):
        if not metadata_list:
            return []
        return [self.construct_image_url(item, image_format=image_format, collection=collection) for item in metadata_list]

    # NEW: generate image URLs directly from a metadata file path
    def urls_from_file(self, filepath, image_format="png", collection="natural"):
        data = self.parse_metadata(filepath)
        return self.generate_image_urls(data, image_format=image_format, collection=collection)

def main(argv=None):
    parser = argparse.ArgumentParser(prog="epic", description="Manage NASA EPIC image metadata and URLs")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_fetch = sub.add_parser("fetch", help="Fetch and save metadata for a date")
    p_fetch.add_argument("--type", default="natural", choices=["natural", "enhanced"], help="EPIC collection")
    p_fetch.add_argument("--date", help="YYYY-MM-DD (omit for latest)")

    p_urls = sub.add_parser("urls", help="Generate image URLs from a metadata file")
    p_urls.add_argument("--type", default="natural", choices=["natural", "enhanced"], help="EPIC collection")
    src_group = p_urls.add_mutually_exclusive_group()
    src_group.add_argument("--file", help="Path to metadata JSON (defaults to nasa_data)")
    src_group.add_argument("--date", help="YYYY-MM-DD to use default file in nasa_data")
    p_urls.add_argument("--format", default="png", choices=["png", "jpg", "thumbs"], help="Image format/folder in archive")
    p_urls.add_argument("-o", "--out", help="Write URLs to file instead of stdout")
    p_urls.add_argument("--fetch-if-missing", action="store_true", help="Fetch metadata if the expected file does not exist")

    p_info = sub.add_parser("info", help="Show a quick summary for a metadata file")
    p_info.add_argument("--type", default="natural", choices=["natural", "enhanced"], help="EPIC collection")
    info_group = p_info.add_mutually_exclusive_group()
    info_group.add_argument("--file", help="Path to metadata JSON")
    info_group.add_argument("--date", help="YYYY-MM-DD to use default file in nasa_data")

    args = parser.parse_args(argv)
    mgr = NasaImageManager()

    if args.cmd == "fetch":
        path = mgr.fetch_metadata(image_type=args.type, date=args.date)
        if not path:
            sys.exit(1)
        print(path)
        return

    if args.cmd == "urls":
        filepath = None
        if args.file:
            filepath = args.file
        elif args.date:
            filepath = mgr.default_metadata_path(args.type, args.date)

        if not filepath or not os.path.exists(filepath):
            if args.fetch_if_missing and args.date:
                filepath = mgr.fetch_metadata(image_type=args.type, date=args.date)
            else:
                print("Metadata file not found. Provide --file or --date (with --fetch-if-missing).")
                sys.exit(1)

        urls = mgr.urls_from_file(filepath, image_format=args.format, collection=args.type)
        if args.out:
            with open(args.out, "w") as f:
                f.write("\n".join(urls))
            print(args.out)
        else:
            print("\n".join(urls))
        return

    if args.cmd == "info":
        filepath = args.file or (mgr.default_metadata_path(args.type, args.date) if args.date else None)
        if not filepath or not os.path.exists(filepath):
            print("Metadata file not found. Provide --file or generate it first.")
            sys.exit(1)
        data = mgr.parse_metadata(filepath)
        print(f"File: {filepath}")
        print(f"Images: {len(data)}")
        if data:
            print(f"First timestamp: {data[0].get('date')}")
            print(f"Last  timestamp: {data[-1].get('date')}")
        return

if __name__ == '__main__':
    # Replace demo with CLI
    main()