"""Fernet compatível com o painel: a chave é SHA-256(IG_ENC_KEY)."""
import base64
import hashlib
from typing import Optional

from cryptography.fernet import Fernet

from . import config


def _fernet() -> Fernet:
    if not config.IG_ENC_KEY:
        raise RuntimeError("IG_ENC_KEY não configurada no worker")
    key = base64.urlsafe_b64encode(hashlib.sha256(config.IG_ENC_KEY.encode()).digest())
    return Fernet(key)


def decrypt(token: Optional[str]) -> str:
    if not token:
        return ""
    return _fernet().decrypt(token.encode()).decode()


def encrypt(text: str) -> str:
    return _fernet().encrypt(text.encode()).decode()
