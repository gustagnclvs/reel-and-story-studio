import hmac
import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI, Header, HTTPException

from . import config
from .runner import Runner

runner = Runner()


@asynccontextmanager
async def lifespan(_: FastAPI):
    config.SESSIONS_DIR.mkdir(parents=True, exist_ok=True)
    if config.AUTOSTART:
        threading.Thread(target=runner.loop, daemon=True).start()
    yield


app = FastAPI(title="Fila IG worker", lifespan=lifespan)


@app.get("/health")
def health():
    return {"ok": True, "running_job": runner.current}


@app.post("/jobs/run-next")
def run_next(authorization: str = Header(default="")):
    """Dispara na mão o próximo job da fila (ignora a pausa do lote)."""
    token = authorization.removeprefix("Bearer ").strip()
    if not config.WORKER_TOKEN or not hmac.compare_digest(token, config.WORKER_TOKEN):
        raise HTTPException(status_code=401, detail="unauthorized")
    return runner.run_next()
