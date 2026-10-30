"""Cliente do endpoint do painel (fila no Supabase). O worker nunca recebe a chave do banco."""
import time
from typing import Any, Dict

import requests

from . import config


class PanelError(Exception):
    pass


def call(op: str, **payload: Any) -> Dict[str, Any]:
    if not config.PANEL_API_URL or not config.WORKER_TOKEN:
        raise PanelError("PANEL_API_URL/WORKER_TOKEN não configurados")
    last: Exception = PanelError("sem tentativa")
    for attempt in range(4):
        try:
            r = requests.post(
                config.PANEL_API_URL,
                json={"op": op, **payload},
                headers={"Authorization": f"Bearer {config.WORKER_TOKEN}"},
                timeout=30,
            )
            if r.status_code == 401:
                raise PanelError("WORKER_TOKEN recusado pelo painel")
            if r.status_code >= 500:
                raise PanelError(f"painel respondeu {r.status_code}")
            r.raise_for_status()
            return r.json()
        except PanelError as e:
            last = e
            if "recusado" in str(e):
                raise
        except requests.RequestException as e:
            last = e
        time.sleep(2 * (attempt + 1))
    raise PanelError(f"falha ao falar com o painel ({op}): {last}")


def signed_url(bucket: str, path: str) -> str:
    return call("signed_url", bucket=bucket, path=path)["url"]
