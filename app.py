from flask import Flask, render_template, request, jsonify
import os
import base64
from io import BytesIO
from PIL import Image
from datetime import datetime

from models.detection import run_object_detection

from models.sketch_diffusion import sketch_to_image
from models.gan_playground import generate_gan_image

app = Flask(__name__)
app.config["UPLOAD_FOLDER"] = "uploads"

os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)


def save_uploaded_image(file_storage, prefix="img"):
    ts = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
    filename = f"{prefix}_{ts}.png"
    path = os.path.join(app.config["UPLOAD_FOLDER"], filename)
    file_storage.save(path)
    return path


def pil_to_base64(img: Image.Image) -> str:
    buffer = BytesIO()
    img.save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode("utf-8")


@app.route("/")
def index():
    return render_template("index.html")

@app.route("/test_canvas.html")
def test_canvas():
    return render_template("test_canvas.html")


# ========== 1) OBJECT REMOVAL ARENA ==========

@app.route("/api/detect_objects", methods=["POST"])
def api_detect_objects():
    """
    Input: image file
    Output: detected bboxes with labels & scores
    """
    if "image" not in request.files:
        return jsonify({"error": "No image"}), 400

    path = save_uploaded_image(request.files["image"], prefix="det")
    detections, annotated_img = run_object_detection(path)

    # return annotated image + bbox metadata
    annotated_b64 = pil_to_base64(annotated_img)

    return jsonify({
        "bboxes": detections,
        "annotated_image": annotated_b64
    })


@app.route("/api/object_edit", methods=["POST"])
def api_object_edit():
    """
    Input: image + bbox actions
    {
      "image": base64,
      "actions": [
         {"bbox": [x1,y1,x2,y2], "action": "remove"},
         {"bbox": [...], "action": "keep"}
      ]
    }
    Output: edited image (inpainted / blurred regions)
    """
    data = request.get_json()
    if not data or "image" not in data or "actions" not in data:
        return jsonify({"error": "Invalid payload"}), 400

    img_b64 = data["image"]
    actions = data["actions"]

    img_bytes = base64.b64decode(img_b64)
    img = Image.open(BytesIO(img_bytes)).convert("RGB")

    import cv2
    import numpy as np

    cv_img = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)

    # Process removals with stretch-based filling
    for act in actions:
        x1, y1, x2, y2 = act["bbox"]
        action = act["action"]
        scale = act.get("scale", 1.0)
        
        # Ensure coordinates are within bounds
        h, w, _ = cv_img.shape
        x1, y1 = max(0, x1), max(0, y1)
        x2, y2 = min(w, x2), min(h, y2)
        
        roi_width = x2 - x1
        roi_height = y2 - y1
        
        if roi_width <= 0 or roi_height <= 0:
            continue
            
        if action == "remove":
            # Use cv2 inpainting for more natural results
            # Create a mask for this specific object
            mask = np.zeros(cv_img.shape[:2], dtype=np.uint8)
            cv2.rectangle(mask, (x1, y1), (x2, y2), 255, -1)
            
            # Use Navier-Stokes based inpainting with a good radius
            # This fills the area by considering surrounding pixels
            cv_img = cv2.inpaint(cv_img, mask, inpaintRadius=7, flags=cv2.INPAINT_NS)

        elif action == "scale" and scale != 1.0:
            # Extract the region
            roi = cv_img[y1:y2, x1:x2].copy()
            if roi.size > 0:
                # Calculate new size
                new_w = int((x2 - x1) * scale)
                new_h = int((y2 - y1) * scale)
                
                if new_w > 0 and new_h > 0:
                    # Resize the ROI
                    scaled_roi = cv2.resize(roi, (new_w, new_h), interpolation=cv2.INTER_LINEAR)
                    
                    # Calculate center position to place scaled ROI
                    center_x = (x1 + x2) // 2
                    center_y = (y1 + y2) // 2
                    new_x1 = max(0, center_x - new_w // 2)
                    new_y1 = max(0, center_y - new_h // 2)
                    new_x2 = min(cv_img.shape[1], new_x1 + new_w)
                    new_y2 = min(cv_img.shape[0], new_y1 + new_h)
                    
                    # Adjust if scaled ROI goes out of bounds
                    actual_w = new_x2 - new_x1
                    actual_h = new_y2 - new_y1
                    
                    if actual_w > 0 and actual_h > 0:
                        # Fill the original region with stretch first (to "remove" the old object)
                        # Reuse the same stretch logic as above
                        if x1 > 0:
                            sample_pixels = cv_img[y1:y2, x1-1:x1]
                            filled_roi = cv2.resize(sample_pixels, (roi_width, roi_height), interpolation=cv2.INTER_NEAREST)
                            cv_img[y1:y2, x1:x2] = filled_roi
                        elif x2 < w:
                            sample_pixels = cv_img[y1:y2, x2:x2+1]
                            filled_roi = cv2.resize(sample_pixels, (roi_width, roi_height), interpolation=cv2.INTER_NEAREST)
                            cv_img[y1:y2, x1:x2] = filled_roi
                        
                        # Place the scaled ROI
                        cv_img[new_y1:new_y2, new_x1:new_x2] = scaled_roi[:actual_h, :actual_w]

    edited_img = Image.fromarray(cv2.cvtColor(cv_img, cv2.COLOR_BGR2RGB))
    edited_b64 = pil_to_base64(edited_img)

    return jsonify({"edited_image": edited_b64})
    

@app.route("/api/sketch_to_image", methods=["POST"])
def api_sketch_to_image():
    """
    Input: sketch image + optional style parameters + prompt
    """
    if "image" not in request.files:
        return jsonify({"error": "No image"}), 400

    guidance_scale = float(request.form.get("guidance_scale", 3.0))
    num_steps = int(request.form.get("num_steps", 15))
    prompt = request.form.get("prompt", "a cute digital art, clean, high quality")

    path = save_uploaded_image(request.files["image"], prefix="sketch")
    out_img = sketch_to_image(path,
                              guidance_scale=guidance_scale,
                              num_inference_steps=num_steps,
                              prompt=prompt)  # Pass the user's prompt
    out_b64 = pil_to_base64(out_img)

    return jsonify({"generated_image": out_b64})


# ========== 3) GAN PLAYGROUND ==========

@app.route("/api/gan_generate", methods=["POST"])
def api_gan_generate():
    """
    Input: latent_dim, noise_scale
    """
    data = request.get_json()
    latent_dim = int(data.get("latent_dim", 16))
    noise_scale = float(data.get("noise_scale", 1.0))

    img = generate_gan_image(latent_dim=latent_dim,
                             noise_scale=noise_scale)
    img_b64 = pil_to_base64(img)
    return jsonify({"generated_image": img_b64})


#========== 4) BOSS BATTLE ==========

BOSS_UPLOAD_FOLDER = "boss_uploads"
os.makedirs(BOSS_UPLOAD_FOLDER, exist_ok=True)

@app.route("/api/boss/upload", methods=["POST"])
def api_boss_upload():
    """Upload a custom boss image"""
    if "image" not in request.files:
        return jsonify({"error": "No image part"}), 400
    file = request.files["image"]
    if file.filename == "":
        return jsonify({"error": "No selected file"}), 400
        
    # Save file
    filename = f"boss_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png"
    path = os.path.join(BOSS_UPLOAD_FOLDER, filename)
    file.save(path)
    
    return jsonify({"success": True, "path": path})

@app.route("/api/boss/start", methods=["GET"])
def api_boss_start():
    """
    Start a new boss battle using images from boss_uploads
    """
    import random
    import glob
    from models.detection import run_pose_estimation, run_object_detection
    
    try:
        # Find all uploaded boss images
        image_patterns = ["*.jpg", "*.jpeg", "*.png"]
        all_images = []
        for pattern in image_patterns:
            all_images.extend(glob.glob(os.path.join(BOSS_UPLOAD_FOLDER, pattern)))
        
        if not all_images:
            return jsonify({"error": "No boss images found. Please upload a boss image first!"}), 404
        
        # Select random image
        image_path = random.choice(all_images)
        print(f"DEBUG: Using boss image: {image_path}")
        
        # 1. Try Pose Estimation first (Best for Villains/Persons)
        detections, _ = run_pose_estimation(image_path)
        mode = "pose"
        
        # 2. Fallback to Object Detection if no skeletons found
        if not detections:
            print("DEBUG: No skeletons found, falling back to object detection")
            detections, _ = run_object_detection(image_path)
            mode = "object"
            
        print(f"DEBUG: Found {len(detections)} detections (Mode: {mode})")
        
        # Extract unique labels from detections
        unique_labels = list(set([det["label"] for det in detections]))
        
        # Select random target labels
        if unique_labels:
            num_targets = min(random.randint(1, 3), len(unique_labels))
            targets = random.sample(unique_labels, num_targets)
        else:
            targets = ["magic_orb"]
        
        # Convert image to base64
        from PIL import Image
        img = Image.open(image_path)
        img_b64 = pil_to_base64(img)
        
        return jsonify({
            "success": True,
            "image": img_b64,
            "detections": detections,
            "targets": targets,
            "mode": mode,  # Tell frontend which mode we are in
            "time_limit": 60
        })
    except Exception as e:
        print(f"ERROR in boss start: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route("/api/boss/analyze", methods=["POST"])
def api_boss_analyze():
    """
    Run Segmentation Analysis on the current boss image
    """
    try:
        # Get image from request (or use last uploaded)
        if "image" not in request.files:
             # For now, let's just use the latest uploaded boss if no image provided
             # But better to pass the image back or ID. 
             # Simplest: Frontend sends the image blob back, or we just pick the latest file in boss_uploads
             import glob
             list_of_files = glob.glob(os.path.join(BOSS_UPLOAD_FOLDER, '*'))
             if not list_of_files:
                 return jsonify({"error": "No boss image found"}), 404
             latest_file = max(list_of_files, key=os.path.getctime)
             image_path = latest_file
        else:
             # Save temp file
             file = request.files["image"]
             image_path = os.path.join(BOSS_UPLOAD_FOLDER, "temp_analyze.png")
             file.save(image_path)
             
        from models.segmentation import run_segmentation
        seg_results, overlay_img = run_segmentation(image_path)
        
        return jsonify({
            "success": True,
            "overlay_image": pil_to_base64(overlay_img),
            "segments": seg_results
        })
    except Exception as e:
        print(f"ERROR in analyze: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/noise/purify", methods=["POST"])
def api_noise_purify():
    """
    Generate a 'purified' tile image using SD.
    Input: 'image' (optional, noise pattern) or just prompt
    """
    try:
        # If image provided, use it as init image (img2img)
        # For now, let's just generate from text to keep it fast/simple if no image
        prompt = "beautiful futuristic clean sci-fi city tile, isometric, high quality, glowing blue energy"
        
        if "image" in request.files:
             path = save_uploaded_image(request.files["image"], prefix="noise_init")
        else:
             # Create a dummy blank image
             dummy = Image.new("RGB", (512, 512), (255, 255, 255))
             path = os.path.join(app.config["UPLOAD_FOLDER"], "dummy_noise.png")
             dummy.save(path)
             
        out_img = sketch_to_image(path, prompt=prompt, strength=0.7)
        return jsonify({"image": pil_to_base64(out_img)})
        
    except Exception as e:
        print(f"ERROR in purify: {e}")
        return jsonify({"error": str(e)}), 500

@app.route("/api/noise/monster", methods=["POST"])
def api_noise_monster():
    """
    Generate a monster sprite from noise
    """
    try:
        prompt = "scary glitch monster, pixel art, dark void creature, red eyes, detailed"
        
        if "image" in request.files:
             path = save_uploaded_image(request.files["image"], prefix="monster_init")
        else:
             # Create a dummy noise image using numpy
             import numpy as np
             noise_arr = np.random.randint(0, 255, (512, 512, 3), dtype=np.uint8)
             dummy = Image.fromarray(noise_arr)
             path = os.path.join(app.config["UPLOAD_FOLDER"], "dummy_monster.png")
             dummy.save(path)
             
        out_img = sketch_to_image(path, prompt=prompt, strength=0.8)
        return jsonify({"image": pil_to_base64(out_img)})
        
    except Exception as e:
        print(f"ERROR in monster: {e}")
        return jsonify({"error": str(e)}), 500



# ========== 5) TARGET TAGGER ==========

@app.route("/api/target_tagger/sprites", methods=["POST"])
def api_target_tagger_sprites():
    """
    Upload an image, segment it, and return individual sprites.
    """
    try:
        if "image" not in request.files:
            return jsonify({"error": "No image uploaded"}), 400
            
        file = request.files["image"]
        path = save_uploaded_image(file, prefix="target_source")
        
        from models.segmentation import run_segmentation
        import cv2
        import numpy as np
        
        # Run segmentation
        seg_results, _ = run_segmentation(path)
        
        if not seg_results:
            return jsonify({"error": "No objects found in image"}), 404
            
        # Load original image for cropping
        orig_img = cv2.imread(path)
        orig_img = cv2.cvtColor(orig_img, cv2.COLOR_BGR2RGB)
        
        sprites = []
        
        for i, res in enumerate(seg_results):
            mask_pts = np.array(res["mask"]).astype(np.int32)
            bbox = res["bbox"] # x1, y1, x2, y2
            label = res["label"]
            
            # Create a mask for this object
            mask = np.zeros(orig_img.shape[:2], dtype=np.uint8)
            cv2.fillPoly(mask, [mask_pts], 255)
            
            # Crop to bbox
            x1, y1, x2, y2 = bbox
            # Add some padding
            pad = 5
            h, w = orig_img.shape[:2]
            x1 = max(0, x1 - pad)
            y1 = max(0, y1 - pad)
            x2 = min(w, x2 + pad)
            y2 = min(h, y2 + pad)
            
            cropped_img = orig_img[y1:y2, x1:x2].copy()
            cropped_mask = mask[y1:y2, x1:x2].copy()
            
            # Create RGBA image
            rgba = cv2.cvtColor(cropped_img, cv2.COLOR_RGB2RGBA)
            rgba[:, :, 3] = cropped_mask
            
            # Convert to base64
            pil_img = Image.fromarray(rgba)
            b64 = pil_to_base64(pil_img)
            
            sprites.append({
                "id": i,
                "label": label,
                "image": b64,
                "width": x2 - x1,
                "height": y2 - y1
            })
            
        return jsonify({
            "success": True,
            "sprites": sprites,
            "count": len(sprites)
        })
        
    except Exception as e:
        print(f"ERROR in target tagger: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(debug=True)
