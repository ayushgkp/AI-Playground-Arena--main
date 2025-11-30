# models/detection.py
from PIL import Image, ImageDraw
import os

try:
    from ultralytics import YOLO
    _HAS_ULTRALYTICS = True
except Exception:
    YOLO = None
    _HAS_ULTRALYTICS = False
    print(f"DEBUG: Could not import ultralytics: {Exception}")


_model = None
if _HAS_ULTRALYTICS:
    try:
        # attempt to load the nano model (this will download weights on first run)
        _model = YOLO("yolov8n.pt")
    except Exception as e:
        print(f"DEBUG: Failed to load YOLO model: {e}")
        _model = None


def run_object_detection(image_path):
    """
    Returns:
      detections: list of dicts {bbox:[x1,y1,x2,y2], label:str, score:float}
      original_img: PIL.Image WITHOUT drawn boxes (clean)

    If Ultralytics/YOLO is not available, returns an empty detection list
    and the original image (so the app remains functional on laptops).
    """
    img = Image.open(image_path).convert("RGB")

    if _model is None:
        # fallback: no detections
        return [], img

    try:
        results = _model(image_path)[0]
    except Exception as e:
        print(f"DEBUG: Error during detection inference: {e}")
        return [], img

    detections = []
    names = getattr(results, 'names', {})
    for box in getattr(results, 'boxes', []):
        try:
            x1, y1, x2, y2 = [int(v) for v in box.xyxy[0].tolist()]
            cls_id = int(box.cls[0].item())
            label = names.get(cls_id, str(cls_id))
            score = float(box.conf[0].item())

            detections.append({
                "bbox": [x1, y1, x2, y2],
                "label": label,
                "score": round(score, 3)
            })
        except Exception:
            # ignore single-box problems
            continue

    # Return CLEAN image without boxes drawn
    return detections, img

_pose_model = None

def run_pose_estimation(image_path):
    """
    Runs Pose Estimation (Skeleton Tracking) on the image.
    Returns:
      keypoints_list: List of dicts, each containing 'keypoints' (17x3 array) and 'bbox'.
      original_img: PIL Image
    """
    global _pose_model
    img = Image.open(image_path).convert("RGB")
    
    if not _HAS_ULTRALYTICS:
        return [], img
        
    if _pose_model is None:
        try:
            print("DEBUG: Loading YOLOv8-Pose model...")
            _pose_model = YOLO("yolov8n-pose.pt")
        except Exception as e:
            print(f"DEBUG: Failed to load Pose model: {e}")
            return [], img
            
    try:
        results = _pose_model(image_path)[0]
    except Exception as e:
        print(f"DEBUG: Error during pose inference: {e}")
        return [], img
        
    pose_results = []
    
    if results.keypoints is not None:
        # Iterate over each detected person
        for i, kps in enumerate(results.keypoints.data):
            # kps is a tensor of shape (17, 3) -> [x, y, conf]
            # Box is in results.boxes[i]
            box = results.boxes[i].xyxy[0].tolist()
            
            pose_results.append({
                "keypoints": kps.tolist(), # Convert tensor to list
                "bbox": [int(b) for b in box],
                "label": "person"
            })
            
    return pose_results, img
