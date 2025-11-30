# models/gan_playground.py
try:
    import torch
    import torch.nn as nn
    _HAS_TORCH = True
except Exception:
    torch = None
    nn = None
    _HAS_TORCH = False

from PIL import Image
import numpy as np


if _HAS_TORCH:
    class TinyGenerator(nn.Module):
        def __init__(self, latent_dim=16, base_channels=32):
            super().__init__()
            self.latent_dim = latent_dim

            self.net = nn.Sequential(
                nn.ConvTranspose2d(latent_dim, base_channels * 4, 4, 1, 0),  # 4x4
                nn.BatchNorm2d(base_channels * 4),
                nn.ReLU(True),

                nn.ConvTranspose2d(base_channels * 4, base_channels * 2, 4, 2, 1),  # 8x8
                nn.BatchNorm2d(base_channels * 2),
                nn.ReLU(True),

                nn.ConvTranspose2d(base_channels * 2, base_channels, 4, 2, 1),  # 16x16
                nn.BatchNorm2d(base_channels),
                nn.ReLU(True),

                nn.ConvTranspose2d(base_channels, 3, 4, 4, 0),  # 64x64
                nn.Tanh()
            )

        def forward(self, z):
            return self.net(z)


    # Single generator instance (untrained)
    _device = "cuda" if torch.cuda.is_available() else "cpu"
    _gen = TinyGenerator(latent_dim=16, base_channels=32).to(_device)


    def generate_gan_image(latent_dim=16, noise_scale=1.0):
        """
        Generate a single 64x64 image from random noise using a tiny PyTorch generator.
        """
        global _gen

        if latent_dim != _gen.latent_dim:
            # recreate generator with new latent dim
            _gen = TinyGenerator(latent_dim=latent_dim, base_channels=32).to(_device)

        z = noise_scale * torch.randn(1, latent_dim, 1, 1, device=_device)
        with torch.no_grad():
            img = _gen(z)[0]  # (3, 64, 64)

        # map from [-1,1] to [0,255]
        img = (img.clamp(-1, 1) + 1) / 2
        img_np = (img.permute(1, 2, 0).cpu().numpy() * 255).astype(np.uint8)

        return Image.fromarray(img_np)

else:
    # Fallback: generate a simple procedural noise image using numpy
    def generate_gan_image(latent_dim=16, noise_scale=1.0):
        h = 64
        w = 64
        # mix several sine waves + random noise for visual variety
        xs = np.linspace(0, 3.14 * 2, w)
        ys = np.linspace(0, 3.14 * 2, h)
        xv, yv = np.meshgrid(xs, ys)
        base = (np.sin(xv * (1 + latent_dim % 5)) + np.cos(yv * (1 + latent_dim % 3)))
        noise = noise_scale * np.random.randn(h, w)
        img_np = (np.stack([base + noise, base * 0.5 + noise, base * -0.3 + noise], axis=2) * 127 + 128)
        img_np = np.clip(img_np, 0, 255).astype(np.uint8)
        return Image.fromarray(img_np)
