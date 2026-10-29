
-- Roles (operator = admin)
CREATE TYPE public.app_role AS ENUM ('admin');
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own roles readable" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- First user to sign up becomes the operator; later signups get no access.
CREATE OR REPLACE FUNCTION public.handle_first_operator()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER on_auth_user_created_operator AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_first_operator();

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- Accounts
CREATE TABLE public.accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL UNIQUE,
  password_enc text NOT NULL,
  password_last2 text NOT NULL DEFAULT '',
  totp_secret_enc text,
  sessionid_enc text,
  proxy text,
  profile_photo_url text,
  story_link text,
  sticker_text text NOT NULL DEFAULT 'Clica aqui 😉❤️',
  sticker_x real NOT NULL DEFAULT 0.50,
  sticker_y real NOT NULL DEFAULT 0.66,
  sticker_w real NOT NULL DEFAULT 0.62,
  sticker_h real NOT NULL DEFAULT 0.12,
  status text NOT NULL DEFAULT 'nova' CHECK (status IN ('nova','conectada','pronta','erro')),
  steps_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.accounts TO authenticated;
GRANT ALL ON public.accounts TO service_role;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "operator accounts" ON public.accounts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER accounts_touch BEFORE UPDATE ON public.accounts FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Front never sees encrypted secrets
REVOKE SELECT (password_enc, totp_secret_enc, sessionid_enc) ON public.accounts FROM authenticated;
REVOKE SELECT ON public.accounts FROM authenticated;
GRANT SELECT (id, username, password_last2, proxy, profile_photo_url, story_link, sticker_text, sticker_x, sticker_y, sticker_w, sticker_h, status, steps_state, last_error, created_at, updated_at) ON public.accounts TO authenticated;
CREATE VIEW public.accounts_safe WITH (security_invoker = true) AS
  SELECT id, username, password_last2, (totp_secret_enc IS NOT NULL) AS has_totp, (sessionid_enc IS NOT NULL) AS has_session,
         proxy, profile_photo_url, story_link, sticker_text, sticker_x, sticker_y, sticker_w, sticker_h,
         status, steps_state, last_error, created_at, updated_at
  FROM public.accounts;

-- Videos
CREATE TABLE public.videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT '',
  storage_path text NOT NULL,
  duration_s real,
  scene_label text,
  caption text,
  hashtags text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','regerar','gerando','ok','erro')),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.videos TO authenticated;
GRANT ALL ON public.videos TO service_role;
ALTER TABLE public.videos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "operator videos" ON public.videos FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Batches
CREATE TABLE public.batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'fila' CHECK (status IN ('fila','rodando','pausado','parado','ok')),
  dry_run boolean NOT NULL DEFAULT true,
  pause_s integer NOT NULL DEFAULT 90 CHECK (pause_s >= 45),
  continue_on_step_error boolean NOT NULL DEFAULT true,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_job_finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.batches TO authenticated;
GRANT ALL ON public.batches TO service_role;
ALTER TABLE public.batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "operator batches" ON public.batches FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Jobs
CREATE TABLE public.jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid REFERENCES public.batches(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  video_id uuid REFERENCES public.videos(id) ON DELETE SET NULL,
  steps jsonb NOT NULL DEFAULT '["login","foto_perfil","virar_criador","postar_reel","postar_story"]'::jsonb,
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  step_atual text,
  status text NOT NULL DEFAULT 'fila' CHECK (status IN ('fila','rodando','ok','erro')),
  log jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz
);
CREATE INDEX jobs_status_idx ON public.jobs (status, created_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jobs TO authenticated;
GRANT ALL ON public.jobs TO service_role;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "operator jobs" ON public.jobs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

GRANT SELECT ON public.accounts_safe TO authenticated;

-- Storage policies (buckets created separately)
CREATE POLICY "operator media read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id IN ('videos','fotos') AND public.has_role(auth.uid(),'admin'));
CREATE POLICY "operator media insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id IN ('videos','fotos') AND public.has_role(auth.uid(),'admin'));
CREATE POLICY "operator media delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id IN ('videos','fotos') AND public.has_role(auth.uid(),'admin'));
