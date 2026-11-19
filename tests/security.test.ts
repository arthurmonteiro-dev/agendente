import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { rateLimit } from "@/lib/rate-limit";

describe("criptografia de segredos", () => {
  it("criptografa e descriptografa", () => {
    const enc = encryptSecret("EAAG-token-secreto");
    expect(enc.startsWith("enc:v1:")).toBe(true);
    expect(enc).not.toContain("token-secreto");
    expect(decryptSecret(enc)).toBe("EAAG-token-secreto");
  });
  it("lê valores antigos sem criptografia", () => {
    expect(decryptSecret("valor-antigo")).toBe("valor-antigo");
    expect(decryptSecret(null)).toBeNull();
  });
  it("detecta adulteração", () => {
    const enc = encryptSecret("abc");
    const parts = enc.split(":");
    parts[4] = Buffer.from("xyz").toString("base64");
    expect(() => decryptSecret(parts.join(":"))).toThrow();
  });
});

describe("limite de tentativas de login", () => {
  it("bloqueia após 10 tentativas", () => {
    const key = `t:${Math.random()}`;
    for (let i = 0; i < 10; i++) expect(rateLimit(key).ok).toBe(true);
    expect(rateLimit(key).ok).toBe(false);
  });
});

import { validateExternalUrl } from "@/lib/whatsapp/providers";
import { clientIp } from "@/lib/rate-limit";

describe("URL da Evolution (proteção contra SSRF)", () => {
  it("aceita domínio público https", () => {
    expect(validateExternalUrl("https://evolution.minhaclinica.com.br/").ok).toBe(true);
  });
  it.each([
    "http://evolution.exemplo.com",
    "https://localhost:8080",
    "https://127.0.0.1",
    "https://169.254.169.254/latest/meta-data",
    "https://10.0.0.5",
    "https://192.168.0.10",
    "https://[::1]",
    "https://servidor-interno",
    "https://db.internal",
    "https://user:pass@exemplo.com",
  ])("bloqueia %s", (url) => {
    expect(validateExternalUrl(url).ok).toBe(false);
  });
});

describe("IP do cliente atrás de proxy", () => {
  it("ignora o início forjado do X-Forwarded-For", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "1.2.3.4, 200.10.10.10" }))).toBe("200.10.10.10");
  });
  it("prefere x-real-ip", () => {
    expect(clientIp(new Headers({ "x-real-ip": "200.1.1.1", "x-forwarded-for": "9.9.9.9" }))).toBe("200.1.1.1");
  });
});
