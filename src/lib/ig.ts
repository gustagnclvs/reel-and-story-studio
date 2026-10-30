export const STEPS = ["login", "foto_perfil", "virar_criador", "postar_reel", "postar_story"] as const;
export type StepName = (typeof STEPS)[number];

export const STEP_LABEL: Record<StepName, string> = {
  login: "Login",
  foto_perfil: "Foto",
  virar_criador: "Criador",
  postar_reel: "Reel",
  postar_story: "Story",
};

export const DEFAULT_STICKER_TEXT = "Clica aqui 😉❤️";
export const STICKER_MAX = 40;
export const MIN_PAUSE_S = 45;
export const DEFAULT_PAUSE_S = 90;

export type ImportRow = {
  username: string;
  password: string;
  totp_secret: string;
  proxy: string;
  profile_photo: string;
  story_link: string;
  sticker_text: string;
};

export type ParsedRow = { line: number; row: ImportRow; errors: string[] };

const COLS: (keyof ImportRow)[] = ["username", "password", "totp_secret", "proxy", "profile_photo", "story_link", "sticker_text"];

export function normalizeUsername(u: string) {
  return u.trim().replace(/^@+/, "").toLowerCase();
}

export function normalizeTotp(s: string) {
  return s.replace(/[\s-]/g, "").toUpperCase();
}

/** totp_secret is the base32 key, never the 6-digit code. */
export function validateTotp(s: string): string | null {
  if (!s) return null;
  if (/^\d{6}$/.test(s)) return "totp_secret parece o código de 6 dígitos; use a chave base32";
  if (!/^[A-Z2-7]+=*$/.test(s) || s.replace(/=/g, "").length < 16) return "totp_secret não é uma chave base32 válida";
  return null;
}

export function validateUsername(u: string): string | null {
  if (!u) return "username vazio";
  if (u.includes("@")) return "username sem @";
  if (!/^[a-z0-9._]{1,30}$/.test(u)) return "username inválido";
  return null;
}

export function validateUrl(u: string): string | null {
  if (!u) return null;
  try {
    const x = new URL(u);
    return x.protocol === "http:" || x.protocol === "https:" ? null : "URL precisa ser http(s)";
  } catch {
    return "URL inválida";
  }
}

function splitLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === delim) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out.map((x) => x.trim());
}

/** Accepts comma or semicolon separated text, with or without header. */
export function parseAccounts(text: string): ParsedRow[] {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim() !== "");
  if (!lines.length) return [];
  const head = lines[0];
  const delim = (head.match(/;/g)?.length ?? 0) > (head.match(/,/g)?.length ?? 0) ? ";" : ",";
  let cols: (keyof ImportRow)[] = COLS;
  let start = 0;
  const first = splitLine(head, delim).map((x) => x.toLowerCase());
  if (first.includes("username")) {
    cols = first.map((h) => (COLS as string[]).includes(h) ? (h as keyof ImportRow) : ("" as keyof ImportRow));
    start = 1;
  }
  const seen = new Set<string>();
  return lines.slice(start).map((l, i) => {
    const cells = splitLine(l, delim);
    const row = Object.fromEntries(COLS.map((c) => [c, ""])) as ImportRow;
    cols.forEach((c, idx) => {
      if (c) row[c] = cells[idx] ?? "";
    });
    row.username = normalizeUsername(row.username);
    row.totp_secret = normalizeTotp(row.totp_secret);
    const errors = [
      validateUsername(row.username),
      !row.password ? "senha vazia" : null,
      validateTotp(row.totp_secret),
      validateUrl(row.story_link),
      row.sticker_text.length > STICKER_MAX ? `sticker_text acima de ${STICKER_MAX} caracteres` : null,
      seen.has(row.username) ? "username repetido na lista" : null,
    ].filter(Boolean) as string[];
    seen.add(row.username);
    return { line: start + i + 1, row, errors };
  });
}

export function maskPassword(last2: string | null | undefined) {
  return last2 ? `••••${last2}` : "••••";
}

export function clampPause(n: number) {
  if (!Number.isFinite(n)) return DEFAULT_PAUSE_S;
  return Math.max(MIN_PAUSE_S, Math.round(n));
}
