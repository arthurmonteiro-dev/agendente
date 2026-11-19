"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { createSession, requireOwner, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { datetimeLocalToDate } from "@/lib/tz";
import { normalizePhone } from "@/lib/phone";
import { getAutomationSettings, type AutomationSettings } from "@/lib/automations/settings";
import { currentPlan } from "@/lib/plans";
import { getProvider, validateExternalUrl, verifyCloudNumber } from "@/lib/whatsapp/providers";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import type { ActionResult } from "@/components/ActionForm";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const int = (fd: FormData, k: string, def: number) => {
  const n = parseInt(str(fd, k), 10);
  return Number.isFinite(n) ? n : def;
};
const done = (): ActionResult => {
  revalidatePath("/painel", "layout");
  return { ok: true };
};

export async function saveClinic(_p: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const tz = str(fd, "timezone") || "America/Sao_Paulo";
  try {
    new Intl.DateTimeFormat("pt-BR", { timeZone: tz });
  } catch {
    return { error: "Fuso horário inválido." };
  }
  await db.clinic.update({
    where: { id: user.clinicId },
    data: {
      name: str(fd, "name") || user.clinic.name,
      phone: str(fd, "phone") || null,
      address: str(fd, "address") || null,
      infoText: str(fd, "infoText") || null,
      timezone: tz,
      slotStepMin: Math.min(Math.max(int(fd, "slotStepMin", 30), 5), 120),
      minNoticeHours: Math.min(Math.max(int(fd, "minNoticeHours", 2), 0), 72),
      maxDaysAhead: Math.min(Math.max(int(fd, "maxDaysAhead", 60), 7), 365),
    },
  });
  return done();
}

const HM = /^\d{2}:\d{2}$/;

export async function saveDentist(_p: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const id = str(fd, "id");
  const name = str(fd, "name");
  if (!name) return { error: "Informe o nome." };

  if (!id) {
    const count = await db.dentist.count({ where: { clinicId: user.clinicId, active: true } });
    const plan = currentPlan(user.clinic);
    if (count >= plan.maxDentists) return { error: `Seu plano permite até ${plan.maxDentists} profissionais ativos.` };
  }

  const hours: { weekday: number; start: string; end: string }[] = [];
  for (let wd = 1; wd <= 7; wd++) {
    for (const n of [1, 2]) {
      const s = str(fd, `h${wd}_s${n}`);
      const e = str(fd, `h${wd}_e${n}`);
      if (!s && !e) continue;
      if (!HM.test(s) || !HM.test(e) || s >= e) return { error: `Horário inválido no dia ${wd} (início deve ser antes do fim).` };
      hours.push({ weekday: wd, start: s, end: e });
    }
  }
  const procedureIds = fd.getAll("procedures").map(String);
  const data = {
    name,
    specialty: str(fd, "specialty") || null,
    cro: str(fd, "cro") || null,
    color: /^#[0-9a-f]{6}$/i.test(str(fd, "color")) ? str(fd, "color") : "#0d9488",
    active: fd.get("active") === "on",
  };
  const validProcs = await db.procedure.findMany({ where: { clinicId: user.clinicId, id: { in: procedureIds } }, select: { id: true } });

  await db.$transaction(async (tx) => {
    const dentist = id
      ? await tx.dentist.update({
          where: { id, clinicId: user.clinicId },
          data: { ...data, procedures: { set: validProcs } },
        })
      : await tx.dentist.create({ data: { ...data, clinicId: user.clinicId, procedures: { connect: validProcs } } });
    await tx.workingHour.deleteMany({ where: { dentistId: dentist.id } });
    await tx.workingHour.createMany({ data: hours.map((h) => ({ ...h, dentistId: dentist.id })) });
  });
  return done();
}

export async function deleteDentist(fd: FormData) {
  const user = await requireUser();
  const id = str(fd, "id");
  const used = await db.appointment.count({ where: { dentistId: id } });
  if (used) await db.dentist.update({ where: { id, clinicId: user.clinicId }, data: { active: false } });
  else await db.dentist.delete({ where: { id, clinicId: user.clinicId } });
  revalidatePath("/painel/configuracoes");
}

function parseMoney(v: string): number | null {
  if (!v) return null;
  const n = Number(v.replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

export async function saveProcedure(_p: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const id = str(fd, "id");
  const name = str(fd, "name");
  const durationMin = int(fd, "durationMin", 0);
  if (!name) return { error: "Informe o nome." };
  if (durationMin < 5 || durationMin > 480) return { error: "Duração entre 5 e 480 minutos." };
  const data = {
    name,
    durationMin,
    priceCents: parseMoney(str(fd, "price")),
    description: str(fd, "description") || null,
    active: fd.get("active") === "on",
    sortOrder: int(fd, "sortOrder", 0),
  };
  if (id) await db.procedure.update({ where: { id, clinicId: user.clinicId }, data });
  else {
    const dentists = await db.dentist.findMany({ where: { clinicId: user.clinicId, active: true }, select: { id: true } });
    await db.procedure.create({ data: { ...data, clinicId: user.clinicId, dentists: { connect: dentists } } });
  }
  return done();
}

export async function deleteProcedure(fd: FormData) {
  const user = await requireUser();
  const id = str(fd, "id");
  const used = await db.appointment.count({ where: { procedureId: id } });
  if (used) await db.procedure.update({ where: { id, clinicId: user.clinicId }, data: { active: false } });
  else await db.procedure.delete({ where: { id, clinicId: user.clinicId } });
  revalidatePath("/painel/configuracoes");
}

export async function addTimeOff(_p: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const tz = user.clinic.timezone;
  try {
    const start = datetimeLocalToDate(str(fd, "start"), tz);
    const end = datetimeLocalToDate(str(fd, "end"), tz);
    if (end <= start) return { error: "O fim deve ser depois do início." };
    const dentistId = str(fd, "dentistId") || null;
    if (dentistId && !(await db.dentist.findFirst({ where: { id: dentistId, clinicId: user.clinicId } }))) {
      return { error: "Profissional inválido." };
    }
    await db.timeOff.create({ data: { clinicId: user.clinicId, dentistId, start, end, reason: str(fd, "reason") || null } });
  } catch {
    return { error: "Datas inválidas." };
  }
  return done();
}

export async function deleteTimeOff(fd: FormData) {
  const user = await requireUser();
  await db.timeOff.deleteMany({ where: { id: str(fd, "id"), clinicId: user.clinicId } });
  revalidatePath("/painel/configuracoes");
}

export async function saveWhatsApp(_p: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireOwner();
  const provider = str(fd, "waProvider");
  if (!["SIMULATOR", "CLOUD", "EVOLUTION"].includes(provider)) return { error: "Provedor inválido." };
  const phoneNumberId = str(fd, "waPhoneNumberId");
  const newToken = str(fd, "waAccessToken");
  let evoBaseUrl = str(fd, "evoBaseUrl") || null;
  if (evoBaseUrl) {
    const v = validateExternalUrl(evoBaseUrl);
    if (!v.ok) return { error: v.error };
    evoBaseUrl = v.url;
  }
  const data: Prisma.ClinicUpdateInput = {
    waProvider: provider as "SIMULATOR" | "CLOUD" | "EVOLUTION",
    waPhoneNumberId: phoneNumberId || null,
    waBusinessAccountId: str(fd, "waBusinessAccountId") || null,
    evoBaseUrl,
    evoInstance: str(fd, "evoInstance") || null,
  };
  // Segredos: campo vazio mantém o valor salvo
  if (newToken) data.waAccessToken = encryptSecret(newToken);
  if (str(fd, "evoApiKey")) data.evoApiKey = encryptSecret(str(fd, "evoApiKey"));
  if (provider === "CLOUD" && !phoneNumberId) return { error: "Informe o Phone Number ID." };

  // O número só é aceito se a Meta confirmar que o token tem acesso a ele.
  const numberChanged = phoneNumberId && phoneNumberId !== user.clinic.waPhoneNumberId;
  if (phoneNumberId && (numberChanged || newToken)) {
    const token = newToken || decryptSecret(user.clinic.waAccessToken);
    if (!token) return { error: "Informe o token de acesso para confirmar o número com a Meta." };
    const check = await verifyCloudNumber(phoneNumberId, token);
    if (!check.ok) return { error: check.error };
  }
  try {
    await db.clinic.update({ where: { id: user.clinicId }, data });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: "Esse Phone Number ID já está em uso por outra clínica." };
    }
    throw e;
  }
  return done();
}

export async function sendTestMessage(_p: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireOwner();
  const clinic = await db.clinic.findUniqueOrThrow({ where: { id: user.clinicId } });
  const to = normalizePhone(str(fd, "to"));
  if (to.length < 12) return { error: "Número inválido." };
  const provider = getProvider(clinic, "WHATSAPP");
  if (provider.kind === "SIMULATOR") return { error: "Configure e salve um provedor real primeiro." };
  const res = await provider.sendText(to, `✅ Teste do Agendente: a ${clinic.name} está conectada ao WhatsApp!`);
  return res.ok ? { ok: true, message: "Mensagem enviada!" } : { error: `Falhou: ${res.error}` };
}

export async function saveAssistant(_p: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireOwner();
  const mode = str(fd, "botMode") === "AI" ? "AI" : "MENU";
  if (mode === "AI" && !currentPlan(user.clinic).ai) return { error: "O assistente com IA está disponível a partir do plano Profissional." };
  await db.clinic.update({
    where: { id: user.clinicId },
    data: {
      botEnabled: fd.get("botEnabled") === "on",
      botMode: mode,
      botName: str(fd, "botName") || "Sofia",
      botInstructions: str(fd, "botInstructions").slice(0, 4000) || null,
      humanTimeoutHours: Math.min(Math.max(int(fd, "humanTimeoutHours", 12), 1), 168),
    },
  });
  return done();
}

export async function saveAutomations(_p: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireOwner();
  const current = getAutomationSettings(user.clinic.automations);
  const next: AutomationSettings = structuredClone(current);
  for (const key of Object.keys(next) as (keyof AutomationSettings)[]) {
    next[key].enabled = fd.get(`${key}.enabled`) === "on";
    const text = str(fd, `${key}.text`);
    if (text) next[key].text = text.slice(0, 1000);
    next[key].waTemplate = str(fd, `${key}.waTemplate`) || undefined;
  }
  next.recall.months = Math.min(Math.max(int(fd, "recall.months", 6), 1), 24);
  await db.clinic.update({ where: { id: user.clinicId }, data: { automations: next as object } });
  return done();
}

export async function addStaff(_p: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireOwner();
  const email = str(fd, "email").toLowerCase();
  const password = str(fd, "password");
  if (!str(fd, "name") || !email.includes("@")) return { error: "Informe nome e e-mail." };
  if (password.length < 8) return { error: "Senha com no mínimo 8 caracteres." };
  if (await db.user.findUnique({ where: { email } })) return { error: "E-mail já cadastrado." };
  await db.user.create({
    data: {
      clinicId: user.clinicId,
      name: str(fd, "name"),
      email,
      passwordHash: await bcrypt.hash(password, 10),
      role: str(fd, "role") === "OWNER" ? "OWNER" : "STAFF",
    },
  });
  return done();
}

export async function removeStaff(fd: FormData) {
  const user = await requireOwner();
  const id = str(fd, "id");
  if (id === user.id) return;
  await db.user.deleteMany({ where: { id, clinicId: user.clinicId } });
  revalidatePath("/painel/configuracoes");
}

export async function changePassword(_p: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const current = str(fd, "current");
  const next = str(fd, "next");
  const confirm = str(fd, "confirm");
  if (!(await bcrypt.compare(current, user.passwordHash))) return { error: "Senha atual incorreta." };
  if (next.length < 10) return { error: "A nova senha precisa ter pelo menos 10 caracteres." };
  if (next !== confirm) return { error: "A confirmação não confere." };
  const updated = await db.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(next, 12) } });
  // Derruba todas as outras sessões (outros navegadores/aparelhos) e mantém esta.
  await createSession(updated.id, updated.passwordHash);
  return { ok: true, message: "Senha alterada ✓ (outros aparelhos foram desconectados)" };
}
