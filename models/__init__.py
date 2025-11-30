"""Models package init for ai_playground.

This file makes the `models` directory a proper Python package. It intentionally
keeps imports lazy (no heavy imports here) so importing `models` is lightweight.
"""
__all__ = [
    "detection",
    "segmentation",
    "sketch_diffusion",
    "gan_playground",
]
