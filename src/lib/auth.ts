import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import crypto from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { db } from "./db";

const COOKIE = "ag_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 dias

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET ausente ou curto (mínimo 32 caracteres)");
  if (process.env.NODE_ENV === "production" && /dev-only|change-me/i.test(s)) {
    throw new Error("SESSION_SECRET de desenvolvimento em produção: gere um novo valor");
  }
  return new TextEncoder().encode(s);
}

/** Impressão digital da senha atual: se a senha mudar, todas as sessões antigas deixam de valer. */
function passwordVersion(passwordHash: string) {
  return crypto.createHash("sha256").update(passwordHash).digest("base64url").slice(0, 16);
}

export async function createSession(userId: string, passwordHash: string) {
  const token = await new SignJWT({ uid: userId, pv: passwordVersion(passwordHash) })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function destroySession() {
  (await cookies()).delete(COOKIE);
}

async function getSessionClaims(): Promise<{ uid: string; pv?: string } | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    if (typeof payload.uid !== "string") return null;
    return { uid: payload.uid, pv: typeof payload.pv === "string" ? payload.pv : undefined };
  } catch {
    return null;
  }
}

export async function getSessionUserId(): Promise<string | null> {
  return (await getSessionClaims())?.uid ?? null;
}

export async function getCurrentUser() {
  const claims = await getSessionClaims();
  if (!claims) return null;
  const user = await db.user.findUnique({ where: { id: claims.uid }, include: { clinic: true } });
  // Usuário removido, ou senha trocada depois que este crachá foi emitido: sessão inválida.
  if (!user || claims.pv !== passwordVersion(user.passwordHash)) return null;
  return user;
}

/** Para páginas/ações do painel: garante usuário logado e retorna usuário + clínica. */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireOwner() {
  const user = await requireUser();
  if (user.role !== "OWNER") redirect("/painel");
  return user;
}

export function isSuperAdmin(email: string) {
  return (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase());
}

export const SESSION_COOKIE = COOKIE;
