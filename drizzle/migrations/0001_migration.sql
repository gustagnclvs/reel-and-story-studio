
DROP VIEW public.accounts_safe;
CREATE VIEW public.accounts_safe WITH (security_invoker = false) AS
  SELECT id, username, password_last2, (totp_secret_enc IS NOT NULL) AS has_totp, (sessionid_enc IS NOT NULL) AS has_session,
         proxy, profile_photo_url, story_link, sticker_text, sticker_x, sticker_y, sticker_w, sticker_h,
         status, steps_state, last_error, created_at, updated_at
  FROM public.accounts
  WHERE public.has_role(auth.uid(), 'admin');
REVOKE ALL ON public.accounts_safe FROM anon;
GRANT SELECT ON public.accounts_safe TO authenticated;
