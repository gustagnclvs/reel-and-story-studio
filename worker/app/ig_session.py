"""Conexão com a conta via instagrapi: sessão salva > sessionid > senha + TOTP."""
import json
import os
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

import pyotp
from instagrapi import Client
from instagrapi.exceptions import (
    ChallengeRequired,
    FeedbackRequired,
    LoginRequired,
    PleaseWaitFewMinutes,
    TwoFactorRequired,
)

from . import config, crypto, panel

# Estes erros marcam a conta como "erro" e o worker segue para a próxima conta.
FATAL = (ChallengeRequired, TwoFactorRequired, FeedbackRequired, PleaseWaitFewMinutes)


def new_client(proxy: Optional[str], uuids: Optional[Dict[str, Any]] = None) -> Client:
    cl = Client()
    if uuids:
        try:
            cl.set_settings({})
            cl.set_uuids(uuids)
        except Exception:
            cl = Client()
    cl.delay_range = [1, 3]
    if proxy:
        cl.set_proxy(proxy)
    return cl


def _session_valid(cl: Client) -> bool:
    try:
        cl.account_info()
        return True
    except LoginRequired:
        return False


def _dump(cl: Client, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    cl.dump_settings(path)
    try:
        os.chmod(path, 0o600)
    except OSError:
        pass


def connect(account: Dict[str, Any]) -> Tuple[Client, str]:
    """Retorna (client, como_conectou). Levanta FATAL ou outra exceção em caso de falha."""
    username = account["username"]
    proxy = account.get("proxy") or None
    path = config.SESSIONS_DIR / f"{username}.json"
    old_uuids: Optional[Dict[str, Any]] = None

    if path.exists():
        try:
            old_uuids = json.loads(path.read_text()).get("uuids")
        except Exception:
            old_uuids = None
        cl = new_client(proxy)
        try:
            cl.load_settings(path)
            cl.delay_range = [1, 3]
            if proxy:
                cl.set_proxy(proxy)
            if _session_valid(cl):
                return cl, "sessão salva reutilizada"
        except FATAL:
            raise
        except Exception:
            pass

    sessionid = crypto.decrypt(account.get("sessionid_enc"))
    if sessionid:
        cl = new_client(proxy, old_uuids)
        try:
            cl.login_by_sessionid(sessionid)
            if _session_valid(cl):
                _dump(cl, path)
                return cl, "login_by_sessionid"
        except FATAL:
            raise
        except Exception:
            pass

    password = crypto.decrypt(account.get("password_enc"))
    totp = crypto.decrypt(account.get("totp_secret_enc"))
    cl = new_client(proxy, old_uuids)
    code = pyotp.TOTP(totp).now() if totp else ""
    cl.login(username, password, verification_code=code)
    _dump(cl, path)
    if cl.sessionid:
        panel.call("update_account", id=account["id"], patch={"sessionid_enc": crypto.encrypt(cl.sessionid)})
    return cl, "senha + 2FA" if code else "senha"
