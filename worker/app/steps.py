"""Etapas reais na conta. Em dry-run nada é alterado na conta."""
import json
import random
import re
import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional
from urllib.parse import urlparse

from instagrapi import Client
from instagrapi.types import StorySticker

from . import captioner, config, media
from .joblog import JobLog, raw_error


class StepError(Exception):
    """Falha da etapa (não derruba o worker)."""


@dataclass
class Ctx:
    cl: Client
    account: Dict[str, Any]
    params: Dict[str, Any]
    videos: List[Dict[str, Any]]
    dry: bool
    log: JobLog
    tmp: Path
    pause: Callable[[float], None] = field(default=lambda s: None)

    @property
    def story_link(self) -> str:
        return (self.params.get("story_link") or self.account.get("story_link") or "").strip()


# ---------------------------------------------------------------- foto de perfil
def foto_perfil(ctx: Ctx) -> None:
    src = ctx.params.get("photo_path") or ctx.account.get("profile_photo_url")
    if not src:
        raise StepError("conta sem foto de perfil (nem URL nem arquivo enviado)")
    raw = media.fetch(src, ctx.tmp, "perfil_raw")
    jpg = media.profile_jpeg(raw, ctx.tmp / "perfil.jpg")
    if ctx.dry:
        ctx.log.info("foto_perfil", f"dry-run: foto baixada e convertida em JPEG ({jpg.stat().st_size // 1024} KB); não foi trocada")
        return
    ctx.cl.account_change_picture(jpg)
    ctx.log.ok("foto_perfil", "foto de perfil trocada")


# ---------------------------------------------------------------- criador
PERSONAL_BLOG_NAMES = {"blog pessoal", "personal blog", "blogueiro", "blogueira"}
FALLBACK_CATEGORY_ID = "2347428775505624"  # default documentado no instagrapi
# Endpoints privados tentados, em ordem, para listar categorias profissionais.
CATEGORY_ENDPOINTS = [
    ("business/account/get_categories/", {}),
    ("business/categories/get_categories/", {}),
    ("creator/categories/", {}),
]


def _current_user(cl: Client) -> Dict[str, Any]:
    return cl.private_request("accounts/current_user/", params={"edit": "true"}).get("user", {}) or {}


def _category_name(u: Dict[str, Any]) -> str:
    return str(u.get("category") or u.get("category_name") or u.get("business_category_name") or "")


def _walk(node: Any) -> Optional[str]:
    """Procura recursivamente um item cujo nome seja Blog pessoal/Personal blog/Blogueiro."""
    if isinstance(node, dict):
        name = node.get("name") or node.get("category_name") or node.get("title")
        cid = node.get("id") or node.get("category_id")
        if isinstance(name, str) and name.strip().lower() in PERSONAL_BLOG_NAMES and cid:
            return str(cid)
        for v in node.values():
            hit = _walk(v)
            if hit:
                return hit
    elif isinstance(node, list):
        for v in node:
            hit = _walk(v)
            if hit:
                return hit
    return None


def resolve_category_id(cl: Client, log: JobLog) -> str:
    for endpoint, params in CATEGORY_ENDPOINTS:
        try:
            hit = _walk(cl.private_request(endpoint, params=params))
        except Exception as e:
            log.info("virar_criador", f"busca de categoria em {endpoint} indisponível: {raw_error(e)[:120]}")
            continue
        if hit:
            log.info("virar_criador", f"categoria 'Blog pessoal' encontrada via {endpoint}: category_id={hit}")
            return hit
    log.info("virar_criador", f"categoria não encontrada na busca; usando o fallback documentado do instagrapi category_id={FALLBACK_CATEGORY_ID}")
    return FALLBACK_CATEGORY_ID


def virar_criador(ctx: Ctx) -> None:
    cl, log = ctx.cl, ctx.log
    before = _current_user(cl)
    cname = _category_name(before)
    is_creator = int(before.get("account_type") or 0) == 3
    if is_creator and cname.strip().lower() in PERSONAL_BLOG_NAMES:
        log.ok("virar_criador", f"já é criador de conteúdo, categoria '{cname}'; nada a fazer")
        return
    cid = resolve_category_id(cl, log)
    if ctx.dry:
        log.info("virar_criador", f"dry-run: converteria para criador (to_account_type=3) com category_id={cid}; hoje account_type={before.get('account_type')} categoria='{cname}'")
        return
    cl.account_convert_to_creator(category_id=cid)
    after = _current_user(cl)
    msg = f"account_type={after.get('account_type')} category_name='{_category_name(after)}' (category_id enviado={cid}; confira se é Blog pessoal)"
    if int(after.get("account_type") or 0) != 3:
        raise StepError(f"Instagram aceitou o pedido mas a conta não consta como criador: {msg}")
    log.ok("virar_criador", f"convertida para criador: {msg}")


# ---------------------------------------------------------------- reel
def postar_reel(ctx: Ctx) -> None:
    if not ctx.videos:
        raise StepError("nenhum vídeo no job")
    failures: List[str] = []
    for i, v in enumerate(ctx.videos):
        label = v.get("name") or v["storage_path"]
        if i:
            ctx.pause(random.uniform(*config.STEP_GAP_RANGE))
        try:
            # A legenda vem da IA ANTES do upload. Sem legenda válida, não posta.
            v = captioner.ensure_caption(v, story_link=ctx.story_link or None)
            ctx.log.info("postar_reel", f"[{label}] cena: {v['scene_label']}")
            caption = captioner.full_caption(v["caption"], v["hashtags"])
            if not v["caption"].strip() or len(v["hashtags"]) != 3:
                raise StepError("legenda/hashtags incompletas; Reel não será postado")
            if ctx.story_link and ctx.story_link in caption:
                raise StepError("URL do story dentro da legenda; Reel não será postado")
            ctx.log.info("postar_reel", f"[{label}] legenda: {v['caption']} | {' '.join(v['hashtags'])}")
            if ctx.dry:
                ctx.log.info("postar_reel", f"[{label}] dry-run: não postado")
                continue
            path = media.fetch_video(v["storage_path"], ctx.tmp, f"reel_{i}")
            m = ctx.cl.clip_upload(path, caption)
            ctx.log.ok("postar_reel", f"[{label}] Reel publicado (code={getattr(m, 'code', '?')})")
        except Exception as e:
            from .ig_session import FATAL
            if isinstance(e, FATAL):
                raise
            failures.append(f"{label}: {raw_error(e)}")
            ctx.log.err("postar_reel", f"[{label}] {raw_error(e)}")
    if failures:
        raise StepError(f"{len(failures)} de {len(ctx.videos)} Reel(s) falharam")


# ---------------------------------------------------------------- story com link nativo
def _validate_link(link: str) -> None:
    u = urlparse(link)
    if u.scheme not in ("http", "https") or not u.netloc:
        raise StepError("link do story inválido (precisa de http/https)")


def validar_url_story(cl: Client, link: str) -> str:
    _validate_link(link)
    resp = cl.private_request(
        "media/validate_reel_url/",
        {"url": link, "_uid": cl.user_id, "_uuid": cl.uuid},
    )
    if isinstance(resp, dict):
        if resp.get("status") not in (None, "ok"):
            raise StepError(f"Instagram recusou a URL: {json.dumps(resp)[:200]}")
        for k in ("is_valid", "valid", "is_url_valid"):
            if k in resp and resp[k] is False:
                raise StepError(f"Instagram recusou a URL: {json.dumps(resp)[:200]}")
    return json.dumps(resp)[:160]


def build_sticker(link: str, text: str, a: Dict[str, Any]) -> StorySticker:
    """Sticker NATIVO (pill branco, ícone de corrente azul). O Instagram o desenha; nada vai na imagem."""
    return StorySticker(
        id="link_sticker_default",
        type="story_link",
        x=float(a.get("sticker_x") or 0.50),
        y=float(a.get("sticker_y") or 0.66),
        z=0,
        width=float(a.get("sticker_w") or 0.62),
        height=float(a.get("sticker_h") or 0.12),
        rotation=0.0,
        extra={
            "link_type": "web",
            "url": link,
            "custom_cta": text,
            "link_title": text,
            "tap_state_str_id": "link_sticker_default",
        },
    )


def postar_story(ctx: Ctx) -> None:
    link = ctx.story_link
    if not link:
        raise StepError("sem link do story")
    text = (ctx.params.get("sticker_text") or ctx.account.get("sticker_text") or config.DEFAULT_STICKER_TEXT).strip()
    if len(text) > config.STICKER_MAX:
        raise StepError(f"texto do sticker com {len(text)} caracteres (máx. {config.STICKER_MAX})")
    v = validar_url_story(ctx.cl, link)
    ctx.log.ok("postar_story", f"URL do story aceita pelo Instagram: {link} ({v})")
    sticker = build_sticker(link, text, ctx.account)

    use_video = ctx.params.get("story_media") == "video" and ctx.videos
    if use_video:
        vid = media.fetch_video(ctx.videos[0]["storage_path"], ctx.tmp, "story_video")
        if ctx.dry:
            ctx.log.info("postar_story", f"dry-run: publicaria story em vídeo com sticker '{text}'; não publicado")
            return
        ctx.cl.video_upload_to_story(vid, stickers=[sticker])
    else:
        src = ctx.params.get("story_image_path") or ctx.params.get("photo_path") or ctx.account.get("profile_photo_url")
        if not src:
            raise StepError("story sem imagem: envie uma imagem no lote ou defina a foto da conta")
        raw = media.fetch(src, ctx.tmp, "story_raw")
        jpg = media.story_jpeg(raw, ctx.tmp / "story.jpg")
        if ctx.dry:
            ctx.log.info("postar_story", f"dry-run: publicaria story 1080x1920 com sticker nativo '{text}'; não publicado")
            return
        ctx.cl.photo_upload_to_story(jpg, stickers=[sticker])
    ctx.log.ok("postar_story", f"Story publicado com sticker de link nativo '{text}' -> {link}")


STEP_FUNCS = {
    "foto_perfil": foto_perfil,
    "virar_criador": virar_criador,
    "postar_reel": postar_reel,
    "postar_story": postar_story,
}
