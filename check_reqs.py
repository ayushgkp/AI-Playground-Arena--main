import importlib.util
import sys

requirements = {
    "flask": "flask",
    "ultralytics": "ultralytics",
    "opencv-python": "cv2",
    "Pillow": "PIL",
    "torch": "torch",
    "torchvision": "torchvision",
    "numpy": "numpy",
    "diffusers": "diffusers",
    "transformers": "transformers",
    "accelerate": "accelerate"
}

print("Checking requirements...")
all_installed = True
for package, module_name in requirements.items():
    if importlib.util.find_spec(module_name) is None:
        print(f"[MISSING] {package} (module: {module_name})")
        all_installed = False
    else:
        print(f"[INSTALLED] {package}")

if all_installed:
    print("\nAll requirements are installed!")
else:
    print("\nSome requirements are missing.")
