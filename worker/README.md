# Fila IG — worker

Executa a fila do painel na conta real, via [instagrapi](https://github.com/subzeroid/instagrapi).
O painel só grava jobs; quem fala com o Instagram é este processo.

## Como funciona

```
painel (React) ──grava──▶ banco (accounts / videos / batches / jobs)
                               ▲
worker (FastAPI) ──HTTPS + WORKER_TOKEN──▶ /api/public/worker/rpc (no painel)
```

O worker não recebe a chave do banco. Ele fala com o endpoint `/api/public/worker/rpc` do
painel, protegido pelo `WORKER_TOKEN`. Senha, TOTP e sessionid chegam criptografados
(Fernet) e só são abertos aqui, com `IG_ENC_KEY`. Nada disso vai para o log.

## Rodar

```bash
cp .env.example .env      # preencha PANEL_API_URL, WORKER_TOKEN, IG_ENC_KEY, AI_API_KEY
docker build -t fila-ig-worker .
docker run -d --name fila-ig --env-file .env -v $(pwd)/data:/data -p 8000:8000 fila-ig-worker
```

Sem Docker (Python 3.11 + ffmpeg instalado):

```bash
pip install -r requirements.txt
set -a; source .env; set +a
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

- `GET /health` — status e job atual.
- `POST /jobs/run-next` com `Authorization: Bearer $WORKER_TOKEN` — dispara o próximo job agora
  (ignora a pausa do lote, mas nunca roda duas contas ao mesmo tempo).

```bash
curl -X POST -H "Authorization: Bearer $WORKER_TOKEN" http://localhost:8000/jobs/run-next
```

`AUTOSTART=true` (padrão) faz o worker consumir a fila sozinho a cada `POLL_SECONDS`.

## Sessões

`/data/sessions/{username}.json` (`dump_settings`) na primeira conexão. Depois:
1. `load_settings` e testa a sessão — se vale, não loga de novo;
2. se a conta tem sessionid salvo, `login_by_sessionid`;
3. senão `cl.login(username, password, verification_code=pyotp.TOTP(segredo).now())`.

Proxy por conta via `cl.set_proxy`. `delay_range = [1, 3]`.
`ChallengeRequired`, `TwoFactorRequired`, `FeedbackRequired`, `PleaseWaitFewMinutes`: a conta vai
para `erro` com a mensagem crua e a fila segue para a próxima conta.

## Etapas

| etapa | o que faz | dry-run |
| --- | --- | --- |
| login | conecta (sessão > sessionid > senha+TOTP) | executa |
| foto_perfil | baixa a foto, converte em JPEG, `account_change_picture` | baixa/converte, não troca |
| virar_criador | `account_convert_to_creator(category_id=…)` (to_account_type=3) | só resolve a categoria |
| postar_reel | IA gera legenda **antes**, depois `clip_upload(path, caption)` | gera e mostra a legenda |
| postar_story | `media/validate_reel_url/`, depois story 1080×1920 com sticker `story_link` nativo | valida a URL |

Categoria: o worker tenta achar "Blog pessoal" / "Personal blog" / "Blogueiro" em alguns endpoints
privados de categorias. Se nenhum responder, usa o id padrão documentado no instagrapi
`2347428775505624` e grava no log o `category_name` que o Instagram devolveu, para você conferir.

Sticker do Story: `StorySticker(id="link_sticker_default", type="story_link", …, extra={link_type, url,
custom_cta, link_title, tap_state_str_id})`. Nada é desenhado na imagem; o Instagram desenha o pill.

## IA da legenda

Qualquer endpoint compatível com `/chat/completions` com visão. Padrão: Gemini
(`AI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai`, `AI_MODEL=gemini-2.5-flash`).
Para GPT-4o: `AI_BASE_URL=https://api.openai.com/v1`, `AI_MODEL=gpt-4o`.
São enviados 4 frames igualmente espaçados. Resposta inválida: uma segunda tentativa; se falhar de
novo, o Reel não é postado.

## Testes

```bash
pip install pytest && IG_ENC_KEY=x pytest -q tests
```
