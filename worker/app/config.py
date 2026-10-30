import os
from pathlib import Path


def _get(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


PANEL_API_URL = _get("PANEL_API_URL")
WORKER_TOKEN = _get("WORKER_TOKEN")
IG_ENC_KEY = _get("IG_ENC_KEY")

AI_API_KEY = _get("AI_API_KEY")
AI_BASE_URL = _get("AI_BASE_URL", "https://generativelanguage.googleapis.com/v1beta/openai").rstrip("/")
AI_MODEL = _get("AI_MODEL", "gemini-2.5-flash")

DATA_DIR = Path(_get("DATA_DIR", "/data"))
SESSIONS_DIR = DATA_DIR / "sessions"
AUTOSTART = _get("AUTOSTART", "true").lower() in ("1", "true", "yes")
POLL_SECONDS = float(_get("POLL_SECONDS", "5"))

STEP_ORDER = ["login", "foto_perfil", "virar_criador", "postar_reel", "postar_story"]
STEP_GAP_RANGE = (8, 20)  # segundos entre etapas da mesma conta
DEFAULT_STICKER_TEXT = "Clica aqui 😉❤️"
STICKER_MAX = 40
