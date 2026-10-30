"""Fila: uma conta por vez. Entre contas, pausa do lote. Entre etapas, 8–20 s."""
import random
import tempfile
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

from . import captioner, config, crypto, ig_session, panel
from .joblog import JobLog, raw_error
from .steps import STEP_FUNCS, Ctx, StepError


class Stopped(Exception):
    pass


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class Runner:
    def __init__(self) -> None:
        self.lock = threading.Lock()  # garante UMA conta por vez
        self.current: Optional[str] = None

    # ------------------------------------------------------------ controle do lote
    def _control(self, batch_id: Optional[str]) -> None:
        if not batch_id:
            return
        while True:
            st = panel.call("batch_status", id=batch_id).get("status")
            if st == "parado":
                raise Stopped("lote parado pelo operador")
            if st != "pausado":
                return
            time.sleep(3)

    def _sleep(self, seconds: float, batch_id: Optional[str]) -> None:
        end = time.time() + seconds
        while time.time() < end:
            time.sleep(min(2.0, max(0.0, end - time.time())))
            self._control(batch_id)

    # ------------------------------------------------------------ job
    def process(self, claim: Dict[str, Any]) -> None:
        job, account, batch = claim["job"], claim["account"], claim.get("batch")
        videos = claim.get("videos") or []
        batch_id = job.get("batch_id")
        dry = bool(batch and batch.get("dry_run"))
        cont = bool(batch["continue_on_step_error"]) if batch else True
        username = account["username"]
        self.current = job["id"]

        secrets = []
        for col in ("password_enc", "totp_secret_enc", "sessionid_enc"):
            try:
                secrets.append(crypto.decrypt(account.get(col)))
            except Exception:
                pass
        log = JobLog(job["id"], username, secrets)
        steps_state: Dict[str, Any] = dict(account.get("steps_state") or {})
        wanted = [s for s in config.STEP_ORDER if s in (job.get("steps") or [])]
        failed = False
        account_patch: Dict[str, Any] = {}

        def finish(status: str) -> None:
            panel.call("update_job", id=job["id"], patch={"status": status, "step_atual": None, "finished_at": _now()})
            panel.call("finish_job", batch_id=batch_id)
            self.current = None

        try:
            if dry:
                log.info("job", "DRY-RUN: login, validação de URL e legenda; sem trocar foto, converter ou postar")
            # ---- login (sempre necessário)
            panel.call("update_job", id=job["id"], patch={"step_atual": "login"})
            try:
                cl, how = ig_session.connect(account)
            except Exception as e:
                steps_state["login"] = {"ok": False, "at": _now(), "msg": raw_error(e)[:200]}
                fatal = isinstance(e, ig_session.FATAL)
                msg = raw_error(e)
                log.err("login", msg)
                panel.call("update_account", id=account["id"], patch={"status": "erro", "last_error": log.scrub(msg), "steps_state": steps_state})
                finish("erro")
                return
            log.ok("login", f"login ok ({how})")
            steps_state["login"] = {"ok": True, "at": _now(), "msg": how}
            account_patch.update({"status": "conectada" if account.get("status") != "pronta" else "pronta", "last_error": None})
            panel.call("update_account", id=account["id"], patch={**account_patch, "steps_state": steps_state})

            with tempfile.TemporaryDirectory() as tmp:
                ctx = Ctx(cl=cl, account=account, params=job.get("params") or {}, videos=videos, dry=dry, log=log, tmp=Path(tmp),
                          pause=lambda s: self._sleep(s, batch_id))
                for step in [s for s in wanted if s != "login"]:
                    self._sleep(random.uniform(*config.STEP_GAP_RANGE), batch_id)
                    panel.call("update_job", id=job["id"], patch={"step_atual": step})
                    try:
                        STEP_FUNCS[step](ctx)
                        if not dry:
                            steps_state[step] = {"ok": True, "at": _now()}
                    except Stopped:
                        raise
                    except ig_session.FATAL as e:
                        msg = raw_error(e)
                        log.err(step, msg)
                        steps_state[step] = {"ok": False, "at": _now(), "msg": log.scrub(msg)[:200]}
                        panel.call("update_account", id=account["id"], patch={"status": "erro", "last_error": log.scrub(msg), "steps_state": steps_state})
                        finish("erro")
                        return
                    except Exception as e:
                        failed = True
                        msg = raw_error(e)
                        log.err(step, msg)
                        steps_state[step] = {"ok": False, "at": _now(), "msg": log.scrub(msg)[:200]}
                        account_patch["last_error"] = log.scrub(f"{step}: {msg}")
                        panel.call("update_account", id=account["id"], patch={"last_error": account_patch["last_error"], "steps_state": steps_state})
                        if not cont:
                            log.err("job", "etapa falhou e o lote não permite pular; encerrando esta conta")
                            break
                    else:
                        panel.call("update_account", id=account["id"], patch={"steps_state": steps_state})

            all_done = all(steps_state.get(s, {}).get("ok") for s in ("foto_perfil", "virar_criador", "postar_reel", "postar_story"))
            panel.call("update_account", id=account["id"], patch={"status": "pronta" if all_done and not failed else "conectada"})
            finish("erro" if failed else "ok")
        except Stopped as e:
            log.err("job", str(e))
            finish("erro")
        except Exception as e:  # nada pode travar a fila
            log.err("job", raw_error(e))
            panel.call("update_account", id=account["id"], patch={"last_error": log.scrub(raw_error(e))})
            finish("erro")

    # ------------------------------------------------------------ disparo
    def _claim_and_run(self, force: bool, background: bool) -> Dict[str, Any]:
        if not self.lock.acquire(blocking=False):
            return {"status": "busy", "job_id": self.current}
        release = True
        try:
            claim = panel.call("claim_job", force=force)
            if not claim.get("job"):
                return {"status": "idle", "wait_s": claim.get("wait_s")}
            job_id = claim["job"]["id"]
            if background:
                def _run() -> None:
                    try:
                        self.process(claim)
                    finally:
                        self.lock.release()
                threading.Thread(target=_run, daemon=True).start()
                release = False
                return {"status": "started", "job_id": job_id}
            self.process(claim)
            return {"status": "done", "job_id": job_id}
        finally:
            if release:
                self.lock.release()

    def run_next(self) -> Dict[str, Any]:
        """POST /jobs/run-next: dispara um job agora (ignora a pausa do lote)."""
        return self._claim_and_run(force=True, background=True)

    def _caption_tick(self) -> None:
        if not self.lock.acquire(blocking=False):
            return
        try:
            v = panel.call("claim_video").get("video")
            if v:
                try:
                    captioner.ensure_caption(v, force=True)
                    print(f"legenda gerada para vídeo {v['id']}", flush=True)
                except Exception as e:
                    print(f"legenda falhou para vídeo {v['id']}: {raw_error(e)}", flush=True)
        finally:
            self.lock.release()

    def loop(self) -> None:
        try:
            panel.call("reset_stale")
        except Exception as e:
            print(f"reset_stale falhou: {e}", flush=True)
        while True:
            try:
                self._caption_tick()
                res = self._claim_and_run(force=False, background=False)
                if res["status"] == "done":
                    continue
            except Exception as e:
                print(f"loop: {raw_error(e)}", flush=True)
            time.sleep(config.POLL_SECONDS)
