import sys
import os

print(f"Python Executable: {sys.executable}")
print(f"CWD: {os.getcwd()}")

try:
    import ultralytics
    print(f"Ultralytics version: {ultralytics.__version__}")
except ImportError as e:
    print(f"ERROR: Could not import ultralytics: {e}")
except Exception as e:
    print(f"ERROR: Unexpected error importing ultralytics: {e}")

try:
    from ultralytics import YOLO
    print("Attempting to load YOLO('yolov8n.pt')...")
    model = YOLO("yolov8n.pt")
    print("Model loaded successfully.")
    
    # Try a dummy prediction
    import numpy as np
    from PIL import Image
    dummy_img = Image.new('RGB', (100, 100), color='red')
    print("Running dummy prediction...")
    results = model(dummy_img)
    print(f"Prediction successful. Results type: {type(results)}")

except Exception as e:
    print(f"ERROR loading/running model: {e}")
