import re
from datetime import datetime, timezone
from typing import Iterable, List

from . import panel

_SESSION_RE = re.compile(r"(sessionid[=:\"' ]+)[A-Za-z0-9%._-]{20,}", re.I)


class JobLog:
    """Uma linha por etapa. Nunca grava senha, TOTP ou sessionid."""

    def __init__(self, job_id: str, username: str, secrets: Iterable[str] = ()):
        self.job_id = job_id
        self.username = username
        self.secrets: List[str] = [s for s in secrets if s and len(s) >= 4]

    def add_secret(self, s: str) -> None:
        if s and len(s) >= 4:
            self.secrets.append(s)

    def scrub(self, text: str) -> str:
        for s in self.secrets:
            text = text.replace(s, "***")
        return _SESSION_RE.sub(r"\1***", text)

    def add(self, step: str, level: str, msg: str) -> None:
        entry = {
            "t": datetime.now(timezone.utc).isoformat(),
            "step": step,
            "username": self.username,
            "level": level,
            "msg": self.scrub(str(msg))[:600],
        }
        print(f"[{entry['t']}] @{self.username} {step} {level}: {entry['msg']}", flush=True)
        try:
            panel.call("append_log", id=self.job_id, entries=[entry])
        except Exception as e:  # o log local já saiu; não derruba o job
            print(f"(falha ao gravar log no painel: {e})", flush=True)

    def ok(self, step: str, msg: str) -> None:
        self.add(step, "ok", msg)

    def info(self, step: str, msg: str) -> None:
        self.add(step, "info", msg)

    def err(self, step: str, msg: str) -> None:
        self.add(step, "erro", msg)


def raw_error(e: BaseException) -> str:
    """Erro cru, sem stacktrace."""
    text = str(e).strip().replace("\n", " ")
    return f"{type(e).__name__}: {text}"[:400] if text else type(e).__name__
