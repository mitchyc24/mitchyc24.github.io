#!/bin/bash
# filepath: c:\Users\mitch\OneDrive\Documents\Programming\GitHub\mitchyc24.github.io\run_LAN_server.sh

echo "Starting local portfolio server..."

# Check if Python 3 is installed
if ! command -v python3 &> /dev/null; then
    echo "Python 3 is not installed or not in PATH. Please install Python 3 first."
    exit 1
fi

# Check if pip3 is available
if ! command -v pip3 &> /dev/null; then
    echo "pip3 is not installed or not in PATH. Cannot check/install dependencies."
    exit 1
fi

# Check if uvicorn and fastapi are installed, if not install them
if ! pip3 show uvicorn &> /dev/null || ! pip3 show fastapi &> /dev/null; then
    echo "uvicorn or fastapi not found. Installing..."
    pip3 install uvicorn fastapi
    if [ $? -ne 0 ]; then
        echo "Failed to install uvicorn and/or fastapi. Please install them manually with: pip3 install uvicorn fastapi"
        exit 1
    fi
fi

# Get local IP address (best effort)
echo "Detecting your local IP address..."
LOCAL_IP_FOR_URL="<your_local_ip>" # Default placeholder

# Attempt for Linux using hostname -I
TEMP_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
if [ -n "$TEMP_IP" ]; then
    LOCAL_IP_FOR_URL=$TEMP_IP
else
    # Attempt for macOS using ifconfig en0 (common interface)
    TEMP_IP=$(ifconfig en0 2>/dev/null | grep "inet " | awk '{print $2}')
    if [ -n "$TEMP_IP" ]; then
        LOCAL_IP_FOR_URL=$TEMP_IP
    else
        # More generic attempt for macOS/Linux if previous methods failed
        # Looks for non-localhost IPv4 addresses
        TEMP_IP=$(ip -4 addr show 2>/dev/null | grep -oP '(?<=inet\s)\d+(\.\d+){3}' | grep -v "127.0.0.1" | head -n 1) # Linux with 'ip'
        if [ -z "$TEMP_IP" ]; then # Fallback for systems without 'ip' or if above failed (e.g. macOS)
             TEMP_IP=$(ifconfig 2>/dev/null | grep "inet " | grep -v "127.0.0.1" | awk '{print $2}' | head -n 1)
        fi

        if [ -n "$TEMP_IP" ]; then
            LOCAL_IP_FOR_URL=$TEMP_IP
        else
            echo "Warning: Could not automatically detect local IP address. Please find it manually (e.g., using 'ip addr' or 'ifconfig')."
        fi
    fi
fi

echo "Your local IP address is likely: $LOCAL_IP_FOR_URL (this might vary depending on your network setup)"

# Run the server using the Python script which should handle uvicorn with reloading
echo "Starting portfolio site on LAN at http://$LOCAL_IP_FOR_URL:8000"
echo "Other devices on your network can access your portfolio at this address (if firewall allows port 8000)."
echo "Local access: http://127.0.0.1:8000 or http://localhost:8000"
echo "Hot reloading is enabled (server will restart on Python file changes)."
echo "Press Ctrl+C to stop the server."

# Ensure serve_portfolio.py exists
if [ ! -f "serve_portfolio.py" ]; then
    echo "Error: serve_portfolio.py not found in the current directory."
    echo "Please create it and configure it to run uvicorn with reload=True."
    exit 1
fi

python3 serve_portfolio.py

echo "Server stopped."