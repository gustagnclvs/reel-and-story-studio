import json
import subprocess
from pathlib import Path
from typing import List

import requests
from PIL import Image, ImageOps

from . import panel


class MediaError(Exception):
    pass


def fetch(src: str, dest_dir: Path, stem: str = "media") -> Path:
    """src: http(s) URL ou 'storage:<bucket>/<path>' (Storage do Supabase)."""
    if not src:
        raise MediaError("origem de mídia vazia")
    if src.startswith("storage:"):
        bucket, _, path = src[len("storage:"):].partition("/")
        url = panel.signed_url(bucket, path)
        suffix = Path(path).suffix or ".bin"
    elif src.startswith(("http://", "https://")):
        url = src
        suffix = Path(src.split("?")[0]).suffix or ".bin"
    else:
        raise MediaError("foto/mídia precisa ser URL http(s) ou arquivo enviado")
    dest = dest_dir / f"{stem}{suffix}"
    with requests.get(url, stream=True, timeout=120) as r:
        if r.status_code != 200:
            raise MediaError(f"download falhou (HTTP {r.status_code})")
        with open(dest, "wb") as f:
            for chunk in r.iter_content(1 << 16):
                f.write(chunk)
    return dest


def fetch_video(storage_path: str, dest_dir: Path, stem: str) -> Path:
    return fetch(f"storage:videos/{storage_path}", dest_dir, stem)


def profile_jpeg(src: Path, dest: Path) -> Path:
    """JPEG quadrado (cover crop) para a foto de perfil."""
    with Image.open(src) as im:
        im = ImageOps.exif_transpose(im).convert("RGB")
        side = min(im.size)
        im = ImageOps.fit(im, (side, side), Image.LANCZOS, centering=(0.5, 0.5))
        if side > 1080:
            im = im.resize((1080, 1080), Image.LANCZOS)
        im.save(dest, "JPEG", quality=92)
    return dest


def story_jpeg(src: Path, dest: Path) -> Path:
    """1080x1920 com cover crop. Nenhum texto/sticker é desenhado aqui."""
    with Image.open(src) as im:
        im = ImageOps.exif_transpose(im).convert("RGB")
        im = ImageOps.fit(im, (1080, 1920), Image.LANCZOS, centering=(0.5, 0.5))
        im.save(dest, "JPEG", quality=92)
    return dest


def video_duration(path: Path) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", str(path)],
        capture_output=True, text=True, timeout=60,
    )
    try:
        return float(json.loads(out.stdout)["format"]["duration"])
    except Exception as e:
        raise MediaError(f"ffprobe não leu a duração: {e}")


def extract_frames(video: Path, dest_dir: Path, n: int = 4) -> List[Path]:
    """n frames igualmente espaçados (meio de cada quarto do vídeo)."""
    dur = video_duration(video)
    frames = []
    for i in range(n):
        t = dur * (i + 0.5) / n
        out = dest_dir / f"frame_{i}.jpg"
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-ss", f"{t:.2f}", "-i", str(video),
             "-frames:v", "1", "-vf", "scale=720:-2", "-q:v", "4", str(out)],
            check=True, timeout=120,
        )
        if out.exists():
            frames.append(out)
    if len(frames) < n:
        raise MediaError("não consegui extrair os 4 frames do vídeo")
    return frames
