"""PNG / GIF / MP4 writers and small image utilities."""
from __future__ import annotations

import os

import numpy as np


def ensure_dir(path):
    d = path if os.path.splitext(path)[1] == "" else os.path.dirname(path)
    if d:
        os.makedirs(d, exist_ok=True)
    return path


def to_uint8(img):
    """float [0,1] (H,W) / (H,W,3) | PIL.Image | uint8 -> uint8 array."""
    if hasattr(img, "convert"):
        return np.asarray(img.convert("RGB"))
    a = np.asarray(img)
    if a.dtype == np.uint8:
        return a
    return (np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8)


def save_png(img, path):
    from PIL import Image
    ensure_dir(path)
    a = to_uint8(img)
    Image.fromarray(a).save(path, optimize=True)
    return path


def _even(a):
    h, w = a.shape[:2]
    return a[: h - h % 2, : w - w % 2]


def save_mp4(frames, path, fps=4, crf=25, scale=None):
    """H.264 / yuv420p MP4 (plays everywhere).  frames: list of images (float/uint8/PIL)."""
    import imageio.v2 as iio
    ensure_dir(path)
    arr = [_even(to_uint8(f)) for f in frames]
    if arr and arr[0].ndim == 2:
        arr = [np.stack([a] * 3, -1) for a in arr]
    if scale:
        from PIL import Image
        arr = [_even(np.asarray(Image.fromarray(a).resize((int(a.shape[1] * scale), int(a.shape[0] * scale)),
                                                         Image.LANCZOS))) for a in arr]
    w = iio.get_writer(path, fps=fps, codec="libx264", quality=None, pixelformat="yuv420p",
                       ffmpeg_params=["-crf", str(crf), "-preset", "medium", "-movflags", "+faststart"],
                       macro_block_size=2)
    for a in arr:
        w.append_data(a)
    w.close()
    return path


def save_gif(frames, path, fps=4, scale=None, colors=128, loop=0):
    """Palette GIF loop (Pillow).  ``scale`` < 1 shrinks to keep the file small."""
    from PIL import Image
    ensure_dir(path)
    ims = []
    for f in frames:
        a = to_uint8(f)
        im = Image.fromarray(a if a.ndim == 3 else a, "RGB" if a.ndim == 3 else "L")
        if scale and scale != 1:
            im = im.resize((int(im.width * scale), int(im.height * scale)), Image.LANCZOS)
        ims.append(im.convert("P", palette=Image.ADAPTIVE, colors=colors) if im.mode == "RGB" else im)
    dur = int(round(1000 / fps))
    ims[0].save(path, save_all=True, append_images=ims[1:], duration=dur, loop=loop, optimize=True)
    return path


def montage(images, cols=4, pad=4, bg=255, labels=None, font_size=14):
    """Grid of equally sized images (float/uint8/PIL) -> PIL RGB."""
    from PIL import Image, ImageDraw
    arr = [to_uint8(i) for i in images]
    arr = [np.stack([a] * 3, -1) if a.ndim == 2 else a for a in arr]
    h = max(a.shape[0] for a in arr)
    w = max(a.shape[1] for a in arr)
    rows = (len(arr) + cols - 1) // cols
    th = font_size + 6 if labels else 0
    out = Image.new("RGB", (cols * (w + pad) + pad, rows * (h + pad + th) + pad), (bg, bg, bg))
    dr = ImageDraw.Draw(out)
    from .render import _font
    f = _font(font_size)
    for k, a in enumerate(arr):
        r, c = divmod(k, cols)
        x = pad + c * (w + pad)
        y = pad + r * (h + pad + th)
        if labels:
            dr.text((x, y), str(labels[k]), fill=(0, 0, 0), font=f)
        out.paste(Image.fromarray(a), (x, y + th))
    return out


def dir_size_mb(path):
    tot = 0
    for root, _, files in os.walk(path):
        for f in files:
            tot += os.path.getsize(os.path.join(root, f))
    return tot / 1e6


def check_sizes(path, max_file_mb=10.0, max_total_mb=60.0):
    """Return list of (file, MB) over the per-file limit and the total MB."""
    big = []
    for root, _, files in os.walk(path):
        for f in files:
            p = os.path.join(root, f)
            mb = os.path.getsize(p) / 1e6
            if mb > max_file_mb:
                big.append((p, mb))
    return big, dir_size_mb(path)
