import crypto from "node:crypto";

/**
 * Criptografia dos segredos guardados no banco (token do WhatsApp, API key da Evolution).
 * Chave: APP_ENCRYPTION_KEY (64 caracteres hex) ou, na falta dela, derivada de SESSION_SECRET.
 * Formato gravado: enc:v1:<iv>:<tag>:<dados>, tudo em base64. Valores antigos (sem prefixo) continuam legíveis.
 */

const PREFIX = "enc:v1:";

function key(): Buffer {
  const hex = process.env.APP_ENCRYPTION_KEY;
  if (hex && /^[0-9a-f]{64}$/i.test(hex)) return Buffer.from(hex, "hex");
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("Defina APP_ENCRYPTION_KEY ou SESSION_SECRET (mínimo 32 caracteres)");
  return crypto.createHash("sha256").update(`agendente-secrets:${s}`).digest();
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${data.toString("base64")}`;
}

export function decryptSecret(stored: string | null | undefined): string | null {
  if (!stored) return null;
  if (!stored.startsWith(PREFIX)) return stored; // valor antigo, sem criptografia
  const [iv, tag, data] = stored.slice(PREFIX.length).split(":");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}
