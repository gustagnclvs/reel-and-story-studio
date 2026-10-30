import { describe, expect, it } from "vitest";
import { clampPause, parseAccounts, validateTotp, MIN_PAUSE_S } from "@/lib/ig";
import { fernetDecrypt, fernetEncrypt } from "@/lib/fernet.server";

describe("importação", () => {
  it("aceita ponto e vírgula, tira @ do username e mantém a chave base32", () => {
    const r = parseAccounts("username;password;totp_secret\n@Fulano;abc123;jbsw y3dp ehpk 3pxp")[0]!;
    expect(r.row.username).toBe("fulano");
    expect(r.row.totp_secret).toBe("JBSWY3DPEHPK3PXP");
    expect(r.errors).toEqual([]);
  });
  it("aceita vírgula sem cabeçalho", () => {
    const r = parseAccounts("fulano,senha,JBSWY3DPEHPK3PXP,,,https://x.com/a,Oi 😉")[0]!;
    expect(r.row.story_link).toBe("https://x.com/a");
    expect(r.row.sticker_text).toBe("Oi 😉");
  });
  it("recusa código de 6 dígitos no lugar da chave", () => {
    expect(validateTotp("123456")).toMatch(/6 dígitos/);
  });
  it("recusa sticker acima de 40 caracteres", () => {
    const r = parseAccounts(`u,p,,,,,${"x".repeat(41)}`)[0]!;
    expect(r.errors.join()).toMatch(/40/);
  });
});

describe("lote", () => {
  it("pausa mínima entre contas é 45s e padrão 90s", () => {
    expect(MIN_PAUSE_S).toBe(45);
    expect(clampPause(10)).toBe(45);
    expect(clampPause(90)).toBe(90);
  });
});

describe("criptografia", () => {
  it("cifra e decifra e não repete o texto", async () => {
    const t = await fernetEncrypt("segredo", "minha-senha");
    expect(t).not.toContain("minha-senha");
    expect(await fernetDecrypt("segredo", t)).toBe("minha-senha");
  });
});
