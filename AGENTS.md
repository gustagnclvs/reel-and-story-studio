<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- Two projects: the React panel (src/) never talks to Instagram; the Python worker (/worker, instagrapi) executes jobs. Why: Instagram automation needs a long-running Python process.
- The worker reaches the queue only through `src/routes/api/public/worker/rpc.ts` (Bearer WORKER_TOKEN, whitelisted patch fields). Why: the service-role DB key is not available outside the app server.
- IG password/TOTP/sessionid are Fernet-encrypted with key SHA-256(IG_ENC_KEY), in `src/lib/fernet.server.ts` and `worker/app/crypto.py`; keep both formats identical. Browser reads accounts only via the `accounts_safe` view.
- Operator access = `user_roles` admin; the first signup becomes operator via trigger. Why: single-operator panel.
