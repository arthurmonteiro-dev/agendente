import { DateTime } from "luxon";
import type { Clinic, Prisma } from "@prisma/client";
import { db } from "../db";
import { firstName } from "../format";
import { formatDay, formatTime, inTz } from "../tz";
import { getOrCreateConversation } from "../whatsapp/inbound";
import { sendToPatient } from "../whatsapp/outbound";
import { getAutomationSettings, renderTemplate, type AutomationConfig } from "./settings";
import type { BotState } from "../bot/state";

/**
 * Executa as automações (lembretes, pós-consulta, retorno, aniversário).
 * Chamado pelo worker (npm run worker) ou por GET /api/cron/tick a cada 1–5 minutos.
 * É idempotente: cada envio marca um carimbo de data para não repetir.
 */

type ApptWithRelations = Prisma.AppointmentGetPayload<{ include: { patient: true; dentist: true; procedure: true } }>;

export interface RunReport {
  reminder24h: number;
  reminder2h: number;
  followup: number;
  recall: number;
  birthday: number;
  errors: number;
}

const H = 3_600_000;

function vars(clinic: Clinic, now: Date, a?: ApptWithRelations, patientName?: string | null) {
  const tz = clinic.timezone;
  return {
    nome: firstName(patientName ?? a?.patient.name) || "tudo bem",
    clinica: clinic.name,
    endereco: clinic.address || "",
    procedimento: a?.procedure.name,
    dentista: a?.dentist.name,
    data: a ? inTz(a.start, tz).toFormat("dd/MM") : undefined,
    dia: a ? relativeDay(a.start, tz, now) : undefined,
    hora: a ? formatTime(a.start, tz) : undefined,
  };
}

function relativeDay(date: Date, tz: string, now: Date) {
  const d = inTz(date, tz).startOf("day");
  const today = inTz(now, tz).startOf("day");
  const diff = Math.round(d.diff(today, "days").days);
  if (diff === 0) return "hoje";
  if (diff === 1) return `amanhã (${d.toFormat("dd/MM")})`;
  return formatDay(date, tz);
}

async function send(
  clinic: Clinic,
  patientId: string,
  cfg: AutomationConfig,
  v: Record<string, string | undefined>,
  nextState?: BotState,
) {
  const patient = await db.patient.findUniqueOrThrow({ where: { id: patientId } });
  const conversation = await getOrCreateConversation(clinic.id, patient.id, "WHATSAPP");
  const body = renderTemplate(cfg.text, v);
  const template =
    cfg.waTemplate && clinic.waProvider === "CLOUD"
      ? {
          name: cfg.waTemplate,
          bodyParams: [v.nome, v.procedimento, v.dentista, v.dia ?? v.data, v.hora].filter((x): x is string => !!x),
        }
      : undefined;
  const msg = await sendToPatient({ clinic, conversation, body, sender: "SYSTEM", template });
  if (nextState && conversation.status !== "HUMAN") {
    await db.conversation.update({ where: { id: conversation.id }, data: { botState: nextState as object } });
  }
  return msg.status !== "FAILED";
}

export async function runAutomationsForClinic(clinic: Clinic, now = new Date()): Promise<RunReport> {
  const settings = getAutomationSettings(clinic.automations);
  const report: RunReport = { reminder24h: 0, reminder2h: 0, followup: 0, recall: 0, birthday: 0, errors: 0 };
  const include = { patient: true, dentist: true, procedure: true } as const;
  const notOptOut = { patient: { optOut: false } };
  const tz = clinic.timezone;
  const local = DateTime.fromJSDate(now).setZone(tz);

  const track = async (key: keyof Omit<RunReport, "errors">, fn: () => Promise<boolean>) => {
    try {
      if (await fn()) report[key]++;
      else report.errors++;
    } catch (e) {
      report.errors++;
      console.error(`[automations] ${clinic.id} ${key}`, e);
    }
  };

  // 1) Lembrete ~24h antes, pedindo confirmação (somente consultas ainda não confirmadas)
  if (settings.reminder24h.enabled) {
    const appts = await db.appointment.findMany({
      where: {
        clinicId: clinic.id,
        status: "SCHEDULED",
        reminder24hAt: null,
        start: { gt: new Date(now.getTime() + 3 * H), lte: new Date(now.getTime() + 24 * H) },
        ...notOptOut,
      },
      include,
      take: 200,
    });
    for (const a of appts) {
      if (a.createdAt.getTime() > a.start.getTime() - 12 * H) continue; // agendada em cima da hora
      await db.appointment.update({ where: { id: a.id }, data: { reminder24hAt: now } });
      await track("reminder24h", () =>
        send(clinic, a.patientId, settings.reminder24h, vars(clinic, now, a), { step: "awaiting_confirmation", appointmentId: a.id }),
      );
    }
  }

  // 2) Lembrete ~2h antes
  if (settings.reminder2h.enabled) {
    const appts = await db.appointment.findMany({
      where: {
        clinicId: clinic.id,
        status: { in: ["SCHEDULED", "CONFIRMED"] },
        reminder2hAt: null,
        start: { gt: now, lte: new Date(now.getTime() + 2 * H) },
        ...notOptOut,
      },
      include,
      take: 200,
    });
    for (const a of appts) {
      if (a.createdAt.getTime() > a.start.getTime() - 3 * H) continue;
      await db.appointment.update({ where: { id: a.id }, data: { reminder2hAt: now } });
      await track("reminder2h", () => send(clinic, a.patientId, settings.reminder2h, vars(clinic, now, a)));
    }
  }

  // 3) Pós-consulta: pesquisa de satisfação (consultas marcadas como concluídas)
  if (settings.followup.enabled) {
    const appts = await db.appointment.findMany({
      where: {
        clinicId: clinic.id,
        status: "COMPLETED",
        followupAt: null,
        end: { gte: new Date(now.getTime() - 48 * H), lte: new Date(now.getTime() - 2 * H) },
        ...notOptOut,
      },
      include,
      take: 200,
    });
    for (const a of appts) {
      await db.appointment.update({ where: { id: a.id }, data: { followupAt: now } });
      await track("followup", () =>
        send(clinic, a.patientId, settings.followup, vars(clinic, now, a), { step: "awaiting_rating", appointmentId: a.id }),
      );
    }
  }

  // Campanhas diárias: só em horário comercial (09h–18h no fuso da clínica)
  const businessHours = local.hour >= 9 && local.hour < 18;

  // 4) Retorno periódico (recall): última consulta concluída há X meses e nada agendado
  if (settings.recall.enabled && businessHours) {
    const cutoff = local.minus({ months: settings.recall.months }).toJSDate();
    const rows = await db.$queryRaw<{ id: string }[]>`
      SELECT p.id FROM "Patient" p
      WHERE p."clinicId" = ${clinic.id} AND p."optOut" = false
        AND EXISTS (SELECT 1 FROM "Appointment" a WHERE a."patientId" = p.id AND a.status = 'COMPLETED')
        AND (SELECT max(a."end") FROM "Appointment" a WHERE a."patientId" = p.id AND a.status = 'COMPLETED') < ${cutoff}
        AND NOT EXISTS (
          SELECT 1 FROM "Appointment" a WHERE a."patientId" = p.id
          AND a.status IN ('SCHEDULED','CONFIRMED') AND a.start > ${now}
        )
        AND (p."lastRecallAt" IS NULL OR p."lastRecallAt" < ${cutoff})
      LIMIT 30`;
    for (const { id } of rows) {
      const p = await db.patient.update({ where: { id }, data: { lastRecallAt: now } });
      await track("recall", () => send(clinic, p.id, settings.recall, vars(clinic, now, undefined, p.name), { step: "recall_offer" }));
    }
  }

  // 5) Aniversário
  if (settings.birthday.enabled && businessHours) {
    const rows = await db.$queryRaw<{ id: string }[]>`
      SELECT id FROM "Patient"
      WHERE "clinicId" = ${clinic.id} AND "optOut" = false AND "birthDate" IS NOT NULL
        AND EXTRACT(MONTH FROM "birthDate") = ${local.month}
        AND EXTRACT(DAY FROM "birthDate") = ${local.day}
        AND ("lastBirthdayYear" IS NULL OR "lastBirthdayYear" <> ${local.year})
      LIMIT 100`;
    for (const { id } of rows) {
      const p = await db.patient.update({ where: { id }, data: { lastBirthdayYear: local.year } });
      await track("birthday", () => send(clinic, p.id, settings.birthday, vars(clinic, now, undefined, p.name)));
    }
  }

  return report;
}

export async function runAllAutomations(now = new Date()) {
  const clinics = await db.clinic.findMany();
  const results: Record<string, RunReport> = {};
  for (const clinic of clinics) {
    results[clinic.slug] = await runAutomationsForClinic(clinic, now);
  }
  return results;
}
