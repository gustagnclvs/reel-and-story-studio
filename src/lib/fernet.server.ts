// Fernet-compatible encryption (same wire format as Python's cryptography.fernet).
// The 32-byte Fernet key is derived as SHA-256(IG_ENC_KEY): the worker does the same.
// Server-only: the secret never reaches the browser.

function b64urlEncode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_");
}

function b64urlDecode(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}

async function keys(secret: string) {
  const raw = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret)));
  const signing = await crypto.subtle.importKey("raw", raw.slice(0, 16), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
  const enc = await crypto.subtle.importKey("raw", raw.slice(16), { name: "AES-CBC" }, false, ["encrypt", "decrypt"]);
  return { signing, enc };
}

export async function fernetEncrypt(secret: string, plain: string): Promise<string> {
  const { signing, enc } = await keys(secret);
  const iv = crypto.getRandomValues(new Uint8Array(16));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-CBC", iv }, enc, new TextEncoder().encode(plain)));
  const body = new Uint8Array(1 + 8 + 16 + ct.length);
  body[0] = 0x80;
  new DataView(body.buffer).setBigUint64(1, BigInt(Math.floor(Date.now() / 1000)));
  body.set(iv, 9);
  body.set(ct, 25);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", signing, body));
  const token = new Uint8Array(body.length + 32);
  token.set(body);
  token.set(mac, body.length);
  return b64urlEncode(token);
}

export async function fernetDecrypt(secret: string, token: string): Promise<string> {
  const { signing, enc } = await keys(secret);
  const data = b64urlDecode(token);
  const body = data.slice(0, data.length - 32);
  const mac = data.slice(data.length - 32);
  if (!(await crypto.subtle.verify("HMAC", signing, mac, body))) throw new Error("invalid token");
  const pt = await crypto.subtle.decrypt({ name: "AES-CBC", iv: body.slice(9, 25) }, enc, body.slice(25));
  return new TextDecoder().decode(pt);
}
