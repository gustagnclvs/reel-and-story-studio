"""Legenda do Reel via IA com visão. Resposta obrigatória: {"cena","legenda","hashtags"}."""
import base64
import json
import re
import tempfile
from pathlib import Path
from typing import Any, Dict, List, Optional

import requests

from . import config, media, panel

SYSTEM_PROMPT = """Você escreve a legenda de um Reel do Instagram a partir de 4 frames do vídeo (em ordem cronológica).
Responda SOMENTE com um JSON válido neste formato exato, sem texto fora dele:
{"cena":"até 6 palavras","legenda":"...","hashtags":["#a","#b","#c"]}

Regras obrigatórias:
- Português do Brasil.
- Legenda curta: no máximo 90 caracteres antes das hashtags. Uma ou duas linhas.
- NÃO descreva o vídeo. Gere curiosidade para a pessoa abrir o PERFIL. O Reel não leva link externo; o link fica só no Story. Nunca escreva URL.
- Baseie-se na cena real. Se o vídeo é no cinema, a legenda fala de cinema. Se é em casa, fala disso. É proibido legenda genérica que serviria para qualquer vídeo.
- Tom de quem viu algo e segurou a informação. Sem "link na bio", sem "me segue", no máximo 1 emoji.
- Exatamente 3 hashtags, específicas da cena, com volume de busca real. Proibido usar só #fyp #viral #explore (ou similares genéricas). Sem hashtag repetida e sem hashtag de marca inventada.
- "cena" descreve em até 6 palavras o que você realmente viu.
- Exemplo de FORMATO (não copie o texto): "Quase levantei no meio da sessão." seguido de 3 hashtags de cinema."""

GENERIC = {"#fyp", "#viral", "#explore", "#foryou", "#foryoupage", "#fy", "#trending", "#reels", "#reel", "#instagram", "#instagood", "#explorepage"}
BANNED_PHRASES = ("link na bio", "link in bio", "me segue", "me siga", "segue aí", "siga-me")
_EMOJI = re.compile("[\U0001F300-\U0001FAFF\u2600-\u27BF\u2B50\u2764\uFE0F\u200D]")
_URL = re.compile(r"https?://|www\.|\.com\b|\.me/|\.link\b", re.I)


class CaptionError(Exception):
    pass


def _emoji_count(text: str) -> int:
    return len([c for c in _EMOJI.findall(text) if c not in ("\uFE0F", "\u200D")])


def parse_json(text: str) -> Dict[str, Any]:
    t = text.strip()
    t = re.sub(r"^```(?:json)?\s*|\s*```$", "", t, flags=re.I)
    start, end = t.find("{"), t.rfind("}")
    if start < 0 or end < 0:
        raise CaptionError("resposta sem JSON")
    try:
        return json.loads(t[start:end + 1])
    except json.JSONDecodeError as e:
        raise CaptionError(f"JSON inválido: {e}")


def validate(obj: Dict[str, Any], story_link: Optional[str] = None) -> Dict[str, Any]:
    """Aplica as regras da legenda. Levanta CaptionError se algo violar."""
    if not isinstance(obj, dict):
        raise CaptionError("resposta não é objeto")
    cena = str(obj.get("cena", "")).strip()
    legenda = str(obj.get("legenda", "")).strip()
    tags = obj.get("hashtags")
    if not cena:
        raise CaptionError("cena vazia")
    if len(cena.split()) > 6:
        raise CaptionError("cena com mais de 6 palavras")
    if not legenda:
        raise CaptionError("legenda vazia")
    if len(legenda) > 90:
        raise CaptionError(f"legenda com {len(legenda)} caracteres (máx. 90)")
    if len(legenda.splitlines()) > 2:
        raise CaptionError("legenda com mais de 2 linhas")
    if "#" in legenda:
        raise CaptionError("hashtag dentro do texto da legenda")
    low = legenda.lower()
    if any(p in low for p in BANNED_PHRASES):
        raise CaptionError("legenda usa chamada proibida (link na bio / me segue)")
    if _URL.search(legenda) or (story_link and story_link.lower() in low):
        raise CaptionError("legenda contém link")
    if _emoji_count(legenda) > 1:
        raise CaptionError("mais de 1 emoji")
    if not isinstance(tags, list) or len(tags) != 3:
        raise CaptionError("precisa de exatamente 3 hashtags")
    clean: List[str] = []
    for t in tags:
        t = str(t).strip()
        if not t.startswith("#"):
            t = "#" + t
        if not re.fullmatch(r"#[\w\u00C0-\u017F]{2,40}", t):
            raise CaptionError(f"hashtag inválida: {t}")
        clean.append(t)
    if len({t.lower() for t in clean}) != 3:
        raise CaptionError("hashtags repetidas")
    if any(t.lower() in GENERIC for t in clean):
        raise CaptionError("hashtag genérica proibida")
    return {"cena": cena, "legenda": legenda, "hashtags": clean}


def full_caption(legenda: str, hashtags: List[str]) -> str:
    return f"{legenda}\n\n{' '.join(hashtags)}"


def _ask(frames: List[Path], extra: str = "") -> str:
    if not config.AI_API_KEY:
        raise CaptionError("AI_API_KEY não configurada no worker")
    content: List[Dict[str, Any]] = [{"type": "text", "text": "Estes são 4 frames do vídeo, em ordem. Gere o JSON." + extra}]
    for f in frames:
        b64 = base64.b64encode(f.read_bytes()).decode()
        content.append({"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}})
    r = requests.post(
        f"{config.AI_BASE_URL}/chat/completions",
        headers={"Authorization": f"Bearer {config.AI_API_KEY}"},
        json={
            "model": config.AI_MODEL,
            "messages": [{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": content}],
            "response_format": {"type": "json_object"},
            "temperature": 0.8,
        },
        timeout=120,
    )
    if r.status_code != 200:
        raise CaptionError(f"IA respondeu HTTP {r.status_code}: {r.text[:200]}")
    try:
        return r.json()["choices"][0]["message"]["content"]
    except Exception:
        raise CaptionError("resposta da IA em formato inesperado")


def generate(frames: List[Path], story_link: Optional[str] = None) -> Dict[str, Any]:
    """Uma tentativa + uma segunda se o JSON vier inválido/violar regra."""
    last: Optional[Exception] = None
    extra = ""
    for _ in range(2):
        try:
            return validate(parse_json(_ask(frames, extra)), story_link)
        except CaptionError as e:
            last = e
            extra = f"\nA resposta anterior foi recusada: {e}. Corrija e responda só o JSON."
    raise CaptionError(f"IA não gerou legenda válida após 2 tentativas: {last}")


def ensure_caption(video: Dict[str, Any], force: bool = False, story_link: Optional[str] = None) -> Dict[str, Any]:
    """Garante cena/legenda/3 hashtags salvos no vídeo. Gera ANTES de qualquer upload."""
    have = video.get("caption") and len(video.get("hashtags") or []) == 3 and video.get("scene_label")
    if have and not force and video.get("status") == "ok":
        return video
    panel.call("update_video", id=video["id"], patch={"status": "gerando", "last_error": None})
    try:
        with tempfile.TemporaryDirectory() as tmp:
            path = media.fetch_video(video["storage_path"], Path(tmp), "video")
            frames = media.extract_frames(path, Path(tmp), 4)
            res = generate(frames, story_link)
        patch = {"scene_label": res["cena"], "caption": res["legenda"], "hashtags": res["hashtags"], "status": "ok", "last_error": None}
        panel.call("update_video", id=video["id"], patch=patch)
        return {**video, **patch}
    except Exception as e:
        panel.call("update_video", id=video["id"], patch={"status": "erro", "last_error": str(e)[:300]})
        raise
