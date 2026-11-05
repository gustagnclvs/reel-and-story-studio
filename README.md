# Reel And Story Studio

Crie um painel web chamado "Fila IG" para operar uma lista de contas do Instagram que EU já administro. Não é um simulador. Cada etapa tem que acontecer de verdade na conta, nesta ordem, sem eu abrir o app:

1. Importar a lista (usuário, senha, segredo TOTP do 2FA).
2. Conectar na conta (login com senha + código de 2FA gerado na hora).
3. Trocar a foto de perfil.
4. Converter para conta profissional do tipo Criador de conteúdo, categoria Blog pessoal.
5. Postar um ou mais Reels. A legenda NÃO é digitada por mim: uma IA assiste o vídeo e escreve uma legenda curta.
6. Publicar um Story com sticker de link NATIVO, clicável, pill branco igual ao do Instagram: ícone de corrente azul + texto "Clica aqui 😉❤️". O toque abre a URL. Não desenhe esse quadrado na imagem.

ARQUITETURA OBRIGATÓRIA
O Lovable não executa instagrapi no browser. Entregue DOIS projetos no mesmo repositório:

A) Painel React + Supabase (o que o Lovable gera na interface).
B) Worker Python 3.11 em /worker, com FastAPI, instagrapi>=2.1, pyotp, Pillow, requests. O painel nunca fala com o Instagram. O painel grava jobs no Supabase; o worker lê a fila e executa. Também exponha POST /jobs/run-next para eu disparar um job na mão.

Login do operador do painel (eu) é separado do login das contas IG. Senha, TOTP e sessionid das contas IG ficam só no worker/Supabase, criptografados, nunca no front, nunca em log.

BIBLIOTECA
Use instagrapi atual (pip), não a Graph API oficial. A Graph API não faz este sticker com texto customizado nem este login por senha+TOTP.

Sessão: dump_settings em /data/sessions/{username}.json na primeira conexão. Nas próximas, load_settings e não logar de novo se a sessão ainda valer. Código 2FA: pyotp.TOTP(totp_secret).now() passado em cl.login(username, password, verification_code=code). Se a linha já tiver sessionid, use login_by_sessionid. Proxy opcional por conta: cl.set_proxy. delay_range = [1, 3].

Se der ChallengeRequired, TwoFactorRequired, FeedbackRequired ou PleaseWaitFewMinutes, marque a conta como erro, guarde a mensagem, NÃO trave a fila, siga para a próxima.

DADOS
Tabela accounts: id, username, password_enc, totp_secret_enc, sessionid_enc, proxy, profile_photo_url, story_link, sticker_text (default "Clica aqui 😉❤️"), sticker_x (0.50), sticker_y (0.66), sticker_w (0.62), sticker_h (0.12), status (nova | conectada | pronta | erro), last_error, updated_at.

Tabela videos: id, storage_path, duration_s, scene_label, caption, hashtags (3), status.

Tabela jobs: id, account_id, video_id, steps jsonb, step_atual, status (fila | rodando | ok | erro), log jsonb, created_at.
Steps padrão, nesta ordem, cada uma pulável por checkbox no lote:
login, foto_perfil, virar_criador, postar_reel, postar_story.

Importação: CSV ou cola de texto. Colunas: username, password, totp_secret, proxy, profile_photo, story_link, sticker_text. Aceite vírgula ou ponto-e-virgula. username sem @. totp_secret é a chave base32, não o código de 6 dígitos.

Foto de perfil e vídeos: upload no Storage do Supabase. Um vídeo pode ir para várias contas. Uma foto pode ser a mesma para o lote ou uma por conta.

TELA
Visual escuro, denso, em português, sem texto de marketing.
- Início: contas na fila, ok, erro, job rodando agora.
- Contas: tabela com status de cada etapa, botão Conectar, botão Rodar lote.
- Importar: drop de CSV + preview das linhas antes de salvar. Não mostre a senha depois de salva, só os 2 últimos caracteres.
- Mídia: grade dos vídeos, miniatura, cena que a IA viu, legenda, 3 hashtags, botão Regerar legenda.
- Lote: escolho as contas, os vídeos, o link do story, o texto do sticker, quais etapas rodar, e a pausa entre contas (padrão 90 segundos, mínimo 45).
- Log: uma linha por etapa, com hora, username e erro cru. Sem stacktrace enorme.

ETAPA FOTO
cl.account_change_picture(caminho). Baixe a URL se for http. JPEG. Se falhar, registre e continue se o lote permitir pular.

ETAPA CRIADOR
cl.account_convert_to_creator(category_id=<id de Blog pessoal>).
to_account_type do criador é 3. Não use conta comercial (2).
Resolva o category_id procurando a categoria cujo nome seja "Blog pessoal", "Personal blog" ou "Blogueiro". Não invente um id. Se a busca não achar, use o fallback documentado pelo instagrapi "2347428775505624" e grave no log o category_name que voltou em account_info(), para eu confirmar. Se a conta já for criador dessa categoria, pule e marque ok. Conversão pode ser recusada pelo Instagram (categoria, contato, Account Center): isso é erro da etapa, não crash.

ETAPA REEL
Poste com cl.clip_upload(path, caption), não como post de feed comum.
A legenda vem da IA ANTES do upload.

IA DA LEGENDA
Modelo com visão (Gemini ou GPT-4o). Mande o vídeo, ou 4 frames evenly spaced se o provedor só aceitar imagem. A IA responde só este JSON:
{"cena":"até 6 palavras","legenda":"...","hashtags":["#a","#b","#c"]}

Regras da legenda, obrigatórias no system prompt:
- Português do Brasil.
- Curta: no máximo 90 caracteres antes das hashtags. Uma ou duas linhas.
- Não descreva o vídeo. Gere curiosidade para a pessoa abrir o PERFIL. O Reel não leva link externo. O link fica só no Story.
- Baseada na cena real. Se o vídeo é no cinema, a legenda fala de cinema. Se é em casa, fala disso. Proibido legenda genérica que serviria para qualquer vídeo.
- Tom de quem viu algo e segurou a informação. Sem "link na bio", sem "me segue", sem emoji em excesso (no máximo 1).
- Exatamente 3 hashtags, específicas da cena, com volume de busca real. Proibido só #fyp #viral #explore. Nada de hashtag repetida nem hashtag da marca inventada.
- Exemplo de formato, não de texto: "Quase levantei no meio da sessão." e então 3 hashtags de cinema.
Se o JSON vier inválido, uma segunda tentativa. Se falhar de novo, não poste o Reel e marque erro. Nunca publique Reel sem legenda.

ETAPA STORY COM LINK
O pill branco NÃO é desenhado na foto. O Instagram desenha o sticker por cima quando o configure recebe type=story_link. Se você queimar o texto na imagem, o clique morre.

Foto do story: 1080x1920, cover crop. Vídeo mp4 segue video_upload_to_story.
Antes de publicar: cl.private_request("media/validate_reel_url/", {url, _uid, _uuid}). Se o Instagram recusar a URL, não publique o story.

Não use só StoryLink(webUri=...). Essa classe não envia o texto do pill. Monte um StorySticker e passe em stickers=:

StorySticker(
  id="link_sticker_default",
  type="story_link",
  x=0.50, y=0.66, z=0, width=0.62, height=0.12, rotation=0.0,
  extra={
    "link_type": "web",
    "url": link,
    "custom_cta": texto,
    "link_title": texto,
    "tap_state_str_id": "link_sticker_default"
  }
)

link_sticker_default é o pill branco com ícone azul, igual ao print. Texto padrão: Clica aqui 😉❤️ (máximo 40 caracteres). x e y são o centro, de 0 a 1. Um link só. Posição padrão no meio, um pouco abaixo do centro, que é onde o print está.

FILA
Uma conta por vez. Entre contas, espere o intervalo do lote (padrão 90s) mesmo se a anterior falhou. Entre etapas da mesma conta, espere 8 a 20 segundos aleatórios. Nunca duas contas em paralelo. Botão Pausar e botão Parar. Dry-run: faz login, valida a URL e gera a legenda, mas não troca foto, não converte, não posta.

O QUE NÃO FAZER
- Não usar a Graph API no lugar do instagrapi.
- Não mockar login, post ou story com dados falsos.
- Não colocar a URL do story dentro da legenda do Reel.
- Não desenhar o sticker "Clica aqui" por cima da foto.
- Não logar senha, TOTP nem sessionid.
- Não seguir, curtir ou comentar em massa. Isso não faz parte do produto.
- Não prometer que o Instagram aceita a conversão profissional em toda conta. Mostre o erro real.

CRITÉRIO DE PRONTO
Eu importo 2 contas de teste, subo 1 vídeo, marco dry-run e vejo no log: login ok, cena que a IA viu, legenda curta, 3 hashtags, URL do story aceita. Tiro o dry-run numa conta só e o Reel aparece com essa legenda, a foto de perfil mudou, a conta está como criador, e o Story tem o pill branco clicável "Clica aqui 😉❤️" abrindo o link.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/455f3f48-9c0f-4b82-acc1-c155706e40ad).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
automation de reels and story
```
