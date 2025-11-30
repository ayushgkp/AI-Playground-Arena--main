# models/sketch_diffusion.py
from PIL import Image, ImageFilter, ImageOps, ImageEnhance, ImageDraw
import numpy as np

_HAS_DIFFUSERS = True
try:
    from diffusers import StableDiffusionImg2ImgPipeline
    import torch
except Exception as e:
    print(f"DEBUG: Could not import diffusers/torch: {e}")
    StableDiffusionImg2ImgPipeline = None
    torch = None
    _HAS_DIFFUSERS = False

# You can change this to a lighter model if needed
MODEL_ID = "stabilityai/sd-turbo"

_pipe = None
_device = None
if _HAS_DIFFUSERS and torch is not None:
    _device = "cuda" if torch.cuda.is_available() else "cpu"
    try:
        print(f"DEBUG: Attempting to load sketch diffusion model on {_device}...")
        _pipe = StableDiffusionImg2ImgPipeline.from_pretrained(
            MODEL_ID,
            torch_dtype=torch.float16 if _device == "cuda" else torch.float32
        )
        _pipe = _pipe.to(_device)
        print("DEBUG: Sketch diffusion model loaded successfully!")
    except Exception as e:
        print(f"DEBUG: Failed to load sketch diffusion model: {e}")
        _pipe = None
else:
    print("DEBUG: Diffusers/torch not available, will use fallback")


def _fallback_stylize(image_path, style="cartoon"):
    """Lightweight fallback: apply image processing to create a stylized version."""
    print("DEBUG: Using fallback stylization (no diffusion model available)")
    img = Image.open(image_path).convert("RGB")
    
    # Resize to standard size
    img = img.resize((512, 512))
    
    # Apply cartoon-like effect:
    # 1. Enhance colors
    enhancer = ImageEnhance.Color(img)
    img = enhancer.enhance(1.5)
    
    # 2. Enhance contrast
    enhancer = ImageEnhance.Contrast(img)
    img = enhancer.enhance(1.3)
    
    # 3. Apply edge detection and combine
    edges = img.filter(ImageFilter.FIND_EDGES)
    
    # 4. Apply smoothing
    img = img.filter(ImageFilter.SMOOTH_MORE)
    
    # 5. Slightly sharpen
    img = img.filter(ImageFilter.SHARPEN)
    
    return img


def sketch_to_image(image_path,
                    guidance_scale=3.0,
                    num_inference_steps=15,
                    prompt="a cute digital art, clean, high quality",
                    style="cartoon",
                    strength=0.8):
    """
    Convert rough sketch to nicer image using img2img. If diffusers/torch
    are not available, uses a lightweight PIL-based stylization fallback.
    """
    if _pipe is None:
        print("DEBUG: Sketch diffusion model not loaded, using fallback")
        return _fallback_stylize(image_path, style=style)

    print("DEBUG: Using Stable Diffusion for sketch-to-image")
    init_image = Image.open(image_path).convert("RGB")
    init_image = init_image.resize((512, 512))

    # Light preprocessing: increase contrast / threshold to emphasize sketch lines
    arr = np.array(init_image.convert("L"))
    arr = ((arr < 200) * 255).astype(np.uint8)  # Explicitly cast to uint8
    init_image = Image.fromarray(arr).convert("RGB")

    try:
        if _device == "cuda":
            with torch.autocast(_device):
                out = _pipe(
                    prompt=prompt,
                    image=init_image,
                    strength=strength,
                    guidance_scale=guidance_scale,
                    num_inference_steps=num_inference_steps
                )
        else:
            out = _pipe(
                prompt=prompt,
                image=init_image,
                strength=strength,
                guidance_scale=guidance_scale,
                num_inference_steps=num_inference_steps
            )
        gen_img = out.images[0]
        print("DEBUG: Sketch-to-image generation successful")
        return gen_img
    except Exception as e:
        print(f"DEBUG: Error during sketch generation: {e}")
        return _fallback_stylize(image_path, style=style)
