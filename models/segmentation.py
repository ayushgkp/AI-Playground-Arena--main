from ultralytics import YOLO
from PIL import Image
import numpy as np
import cv2

_seg_model = None

def run_segmentation(image_path):
    """
    Runs Instance Segmentation on the image using YOLOv8-Seg.
    Returns:
      results: List of dicts with 'bbox', 'label', and 'mask' (polygon points)
      overlay_img: PIL Image with masks drawn
    """
    global _seg_model
    img = Image.open(image_path).convert("RGB")
    
    if _seg_model is None:
        try:
            print("DEBUG: Loading YOLOv8-Seg model...")
            _seg_model = YOLO("yolov8n-seg.pt")
        except Exception as e:
            print(f"DEBUG: Failed to load Seg model: {e}")
            return [], img
            
    try:
        results = _seg_model(image_path)[0]
    except Exception as e:
        print(f"DEBUG: Error during segmentation: {e}")
        return [], img
        
    seg_results = []
    
    # Create an overlay image
    img_cv = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)
    
    if results.masks is not None:
        for i, mask in enumerate(results.masks.xy):
            # mask is an array of [x, y] points
            if len(mask) == 0: continue
            
            box = results.boxes[i].xyxy[0].tolist()
            label_idx = int(results.boxes[i].cls[0])
            label = results.names[label_idx]
            
            seg_results.append({
                "bbox": [int(b) for b in box],
                "mask": mask.tolist(),
                "label": label
            })
            
            # Draw on overlay
            pts = np.array(mask, np.int32)
            pts = pts.reshape((-1, 1, 2))
            color = (0, 255, 0) if label == "person" else (255, 0, 255)
            cv2.fillPoly(img_cv, [pts], color)
            
    # Blend overlay
    alpha = 0.5
    img_cv_orig = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)
    cv2.addWeighted(img_cv, alpha, img_cv_orig, 1 - alpha, 0, img_cv)
    
    return seg_results, Image.fromarray(cv2.cvtColor(img_cv, cv2.COLOR_BGR2RGB))
