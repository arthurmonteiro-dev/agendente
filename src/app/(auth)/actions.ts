"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { createSession, destroySession } from "@/lib/auth";
import { createClinicWithOwner } from "@/lib/onboarding";
import { clientIp, rateLimit, rateLimitReset } from "@/lib/rate-limit";
import { headers } from "next/headers";

export type AuthState = { error?: string } | null;

export async function loginAction(_prev: AuthState, fd: FormData): Promise<AuthState> {
  const email = String(fd.get("email") || "").toLowerCase().trim();
  const password = String(fd.get("password") || "");
  const ip = clientIp(await headers());
  // 10 tentativas por e-mail+IP e 30 por e-mail (de qualquer IP) a cada 15 min
  const limit = rateLimit(`login:${email}:${ip}`);
  const perEmail = rateLimit(`login-email:${email}`, 30);
  if (!limit.ok || !perEmail.ok) {
    return { error: `Muitas tentativas. Tente de novo em ${Math.max(limit.retryAfterMin, perEmail.retryAfterMin)} min.` };
  }
  const user = await db.user.findUnique({ where: { email } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return { error: "E-mail ou senha incorretos." };
  }
  rateLimitReset(`login:${email}:${ip}`);
  await createSession(user.id, user.passwordHash);
  const next = String(fd.get("next") || "");
  redirect(next.startsWith("/painel") || next.startsWith("/admin") ? next : "/painel");
}

const SignupSchema = z.object({
  ownerName: z.string().trim().min(2, "Informe seu nome"),
  clinicName: z.string().trim().min(2, "Informe o nome da clínica"),
  email: z.email("E-mail inválido"),
  phone: z.string().trim().optional(),
  password: z.string().min(10, "A senha precisa de pelo menos 10 caracteres"),
  aceite: z.literal("on", { error: "É preciso aceitar os Termos de uso e a Política de privacidade" }),
});

export async function signupAction(_prev: AuthState, fd: FormData): Promise<AuthState> {
  // Anti-robô: 3 contas por IP por hora e no máximo 30 contas novas por hora no sistema todo
  const ip = clientIp(await headers());
  const perIp = rateLimit(`signup:${ip}`, 3, 60 * 60_000);
  const global = rateLimit("signup:global", 30, 60 * 60_000);
  if (!perIp.ok || !global.ok) {
    return { error: "Muitos cadastros em pouco tempo. Tente novamente mais tarde ou fale com o suporte." };
  }
  // Campo invisível: pessoas não preenchem, robôs costumam preencher
  if (String(fd.get("website") || "")) return { error: "Não foi possível criar a conta." };
  const parsed = SignupSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const exists = await db.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
  if (exists) return { error: "Já existe uma conta com esse e-mail." };
  const { aceite: _aceite, ...data } = parsed.data;
  const { user } = await createClinicWithOwner({ ...data, acceptedTermsAt: new Date() });
  await createSession(user.id, user.passwordHash);
  redirect("/painel?bemvindo=1");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}
