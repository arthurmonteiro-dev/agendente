/**
 * Limite simples de tentativas (em memória, por instância do app).
 * Usado no login: 10 tentativas por e-mail/IP a cada 15 minutos.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, max = 10, windowMs = 15 * 60_000): { ok: boolean; retryAfterMin: number } {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterMin: 0 };
  }
  b.count++;
  if (b.count > max) return { ok: false, retryAfterMin: Math.ceil((b.resetAt - now) / 60_000) };
  return { ok: true, retryAfterMin: 0 };
}

export function rateLimitReset(key: string) {
  buckets.delete(key);
}

// limpeza periódica
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (b.resetAt < now) buckets.delete(k);
}, 60_000).unref?.();

/**
 * IP de quem está acessando. Atrás de um proxy (Railway, Render, Vercel), o cliente pode
 * forjar o início do X-Forwarded-For; por isso usamos x-real-ip ou o ÚLTIMO item da lista,
 * que é o que o proxy do provedor acrescentou.
 */
export function clientIp(h: Headers): string {
  const real = h.get("x-real-ip");
  if (real) return real.trim();
  const xff = h.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map((x) => x.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  return "local";
}
