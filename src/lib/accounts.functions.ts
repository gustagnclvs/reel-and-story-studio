import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizeTotp, normalizeUsername, validateTotp, validateUsername, STICKER_MAX } from "./ig";

const rowSchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(256),
  totp_secret: z.string().max(256).default(""),
  proxy: z.string().max(512).default(""),
  profile_photo: z.string().max(1024).default(""),
  story_link: z.string().max(1024).default(""),
  sticker_text: z.string().max(STICKER_MAX).default(""),
});

export const importAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ rows: z.array(rowSchema).min(1).max(500) }).parse(d))
  .handler(async ({ data, context }) => {
    const key = process.env.IG_ENC_KEY;
    if (!key) throw new Error("IG_ENC_KEY não configurada no painel.");
    const { fernetEncrypt } = await import("./fernet.server");
    const { supabase } = context;

    const { data: isOp } = await supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isOp) throw new Error("Sem permissão.");

    const rows = data.rows.map((r) => ({
      ...r,
      username: normalizeUsername(r.username),
      totp_secret: normalizeTotp(r.totp_secret),
    }));
    for (const r of rows) {
      const err = validateUsername(r.username) ?? validateTotp(r.totp_secret);
      if (err) throw new Error(`${r.username || "(vazio)"}: ${err}`);
    }

    const { data: existing, error: exErr } = await supabase
      .from("accounts")
      .select("username")
      .in("username", rows.map((r) => r.username));
    if (exErr) throw new Error(exErr.message);
    const known = new Set((existing ?? []).map((e) => e.username));

    let created = 0;
    let updated = 0;
    for (const r of rows) {
      const fields = {
        password_enc: await fernetEncrypt(key, r.password),
        password_last2: r.password.slice(-2),
        ...(r.totp_secret ? { totp_secret_enc: await fernetEncrypt(key, r.totp_secret) } : {}),
        ...(r.proxy ? { proxy: r.proxy } : {}),
        ...(r.profile_photo ? { profile_photo_url: r.profile_photo } : {}),
        ...(r.story_link ? { story_link: r.story_link } : {}),
        ...(r.sticker_text ? { sticker_text: r.sticker_text } : {}),
      };
      if (known.has(r.username)) {
        // new credentials invalidate any stored sessionid
        const { error } = await supabase
          .from("accounts")
          .update({ ...fields, sessionid_enc: null, status: "nova", last_error: null })
          .eq("username", r.username);
        if (error) throw new Error(error.message);
        updated++;
      } else {
        const { error } = await supabase.from("accounts").insert({ username: r.username, ...fields });
        if (error) throw new Error(error.message);
        created++;
      }
    }
    return { created, updated };
  });
