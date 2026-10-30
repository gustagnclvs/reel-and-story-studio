import os
os.environ.setdefault("IG_ENC_KEY", "segredo-teste")

import pytest
from app import captioner, crypto
from app.steps import build_sticker

OK = {"cena": "sala de cinema escura", "legenda": "Quase levantei no meio da sessão.", "hashtags": ["#cinema", "#filmesdeterror", "#salaescura"]}


def test_legenda_valida():
    assert captioner.validate(OK)["hashtags"] == ["#cinema", "#filmesdeterror", "#salaescura"]


@pytest.mark.parametrize("patch,err", [
    ({"legenda": "x" * 91}, "90"),
    ({"legenda": "Corre ver, link na bio"}, "proibida"),
    ({"legenda": "Olha https://site.com"}, "link"),
    ({"legenda": "Nossa 😱😱"}, "emoji"),
    ({"hashtags": ["#cinema", "#filme"]}, "3 hashtags"),
    ({"hashtags": ["#cinema", "#Cinema", "#filme"]}, "repetidas"),
    ({"hashtags": ["#fyp", "#viral", "#explore"]}, "genérica"),
    ({"cena": "uma cena com muito mais de seis palavras"}, "6 palavras"),
])
def test_legenda_regras(patch, err):
    with pytest.raises(captioner.CaptionError, match=err):
        captioner.validate({**OK, **patch})


def test_url_do_story_nunca_na_legenda():
    with pytest.raises(captioner.CaptionError):
        captioner.validate({**OK, "legenda": "veja meusite.com/x"}, story_link="meusite.com/x")


def test_json_invalido():
    with pytest.raises(captioner.CaptionError):
        captioner.parse_json("nada aqui")
    assert captioner.parse_json('```json\n{"cena":"a"}\n```') == {"cena": "a"}


def test_sticker_nativo_padrao():
    s = build_sticker("https://x.com", "Clica aqui 😉❤️", {})
    assert s.type == "story_link" and s.id == "link_sticker_default"
    assert (s.x, s.y, s.width, s.height, s.z) == (0.50, 0.66, 0.62, 0.12, 0)
    assert s.extra["custom_cta"] == "Clica aqui 😉❤️" and s.extra["link_type"] == "web"
    assert s.extra["tap_state_str_id"] == "link_sticker_default"


def test_crypto_roundtrip():
    assert crypto.decrypt(crypto.encrypt("abc")) == "abc"


def test_crypto_token_do_painel():
    tok = os.environ.get("PANEL_TOKEN")
    if tok:
        assert crypto.decrypt(tok) == "senha-do-painel"
