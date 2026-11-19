import { DateTime } from "luxon";
import { Prisma, type AppointmentSource } from "@prisma/client";
import { db } from "../db";
import { computeSlots, dedupeByStart, overlaps, type Slot } from "./availability";

export * from "./availability";

const ACTIVE_STATUSES = ["SCHEDULED", "CONFIRMED", "COMPLETED"] as const;

export class SchedulingError extends Error {
  constructor(
    public code: "SLOT_TAKEN" | "NOT_AVAILABLE" | "NOT_FOUND" | "INVALID",
    message: string,
  ) {
    super(message);
  }
}

export interface FindSlotsOptions {
  clinicId: string;
  procedureId: string;
  dentistId?: string | null;
  fromDay?: string; // data local; padrão = hoje
  days?: number;
  now?: Date;
  excludeAppointmentId?: string; // ao remarcar, ignora a própria consulta
}

/** Busca horários livres consultando o banco. */
export async function findAvailableSlots(opts: FindSlotsOptions): Promise<Slot[]> {
  const clinic = await db.clinic.findUniqueOrThrow({ where: { id: opts.clinicId } });
  const procedure = await db.procedure.findFirst({
    where: { id: opts.procedureId, clinicId: clinic.id, active: true },
    include: { dentists: { where: { active: true }, include: { workingHours: true } } },
  });
  if (!procedure) throw new SchedulingError("NOT_FOUND", "Procedimento não encontrado");

  let dentists = procedure.dentists;
  if (opts.dentistId) dentists = dentists.filter((d) => d.id === opts.dentistId);
  if (dentists.length === 0) return [];

  const now = opts.now ?? new Date();
  const tz = clinic.timezone;
  const today = DateTime.fromJSDate(now).setZone(tz).toISODate()!;
  let fromDay = opts.fromDay && opts.fromDay > today ? opts.fromDay : today;
  const maxDay = DateTime.fromISO(today, { zone: tz }).plus({ days: clinic.maxDaysAhead }).toISODate()!;
  if (fromDay > maxDay) return [];
  let days = Math.max(1, Math.min(opts.days ?? 14, 62));
  const lastDay = DateTime.fromISO(fromDay, { zone: tz }).plus({ days: days - 1 }).toISODate()!;
  if (lastDay > maxDay) days = Math.round(DateTime.fromISO(maxDay).diff(DateTime.fromISO(fromDay), "days").days) + 1;

  const rangeStart = DateTime.fromISO(fromDay, { zone: tz }).startOf("day").toJSDate();
  const rangeEnd = DateTime.fromISO(fromDay, { zone: tz }).plus({ days }).startOf("day").toJSDate();
  const dentistIds = dentists.map((d) => d.id);

  const [appointments, timeOffs] = await Promise.all([
    db.appointment.findMany({
      where: {
        clinicId: clinic.id,
        dentistId: { in: dentistIds },
        status: { in: [...ACTIVE_STATUSES] },
        start: { lt: rangeEnd },
        end: { gt: rangeStart },
        ...(opts.excludeAppointmentId ? { id: { not: opts.excludeAppointmentId } } : {}),
      },
      select: { dentistId: true, start: true, end: true },
    }),
    db.timeOff.findMany({
      where: {
        clinicId: clinic.id,
        OR: [{ dentistId: null }, { dentistId: { in: dentistIds } }],
        start: { lt: rangeEnd },
        end: { gt: rangeStart },
      },
      select: { dentistId: true, start: true, end: true },
    }),
  ]);

  return computeSlots({
    tz,
    fromDay,
    days,
    durationMin: procedure.durationMin,
    stepMin: clinic.slotStepMin,
    now,
    minNoticeMin: clinic.minNoticeHours * 60,
    dentists: dentists.map((d) => ({ id: d.id, workingHours: d.workingHours })),
    busy: [...appointments, ...timeOffs],
  });
}

export async function findSlotsNoPreference(opts: FindSlotsOptions) {
  return dedupeByStart(await findAvailableSlots({ ...opts, dentistId: null }));
}

export interface BookInput {
  clinicId: string;
  patientId: string;
  procedureId: string;
  dentistId: string;
  start: Date;
  source: AppointmentSource;
  notes?: string | null;
  /** Agendamento pela equipe pode ser "encaixe" fora do expediente. Robôs nunca. */
  allowOutsideHours?: boolean;
  /** Remarcação: cancela esta consulta na mesma transação. */
  replacesAppointmentId?: string;
  now?: Date;
}

async function withSerializableRetry<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(fn, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (e) {
      const retryable = e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2034";
      if (!retryable || attempt >= 3) throw e;
    }
  }
}

export async function bookAppointment(input: BookInput) {
  const procedure = await db.procedure.findFirst({
    where: { id: input.procedureId, clinicId: input.clinicId },
    include: { dentists: { select: { id: true } } },
  });
  if (!procedure) throw new SchedulingError("NOT_FOUND", "Procedimento não encontrado");
  const dentist = await db.dentist.findFirst({ where: { id: input.dentistId, clinicId: input.clinicId } });
  if (!dentist) throw new SchedulingError("NOT_FOUND", "Profissional não encontrado");
  const patient = await db.patient.findFirst({ where: { id: input.patientId, clinicId: input.clinicId } });
  if (!patient) throw new SchedulingError("NOT_FOUND", "Paciente não encontrado");

  const start = input.start;
  const end = new Date(start.getTime() + procedure.durationMin * 60_000);

  if (!input.allowOutsideHours) {
    if (!procedure.dentists.some((d) => d.id === dentist.id)) {
      throw new SchedulingError("NOT_AVAILABLE", "Este profissional não realiza esse procedimento");
    }
    const clinic = await db.clinic.findUniqueOrThrow({ where: { id: input.clinicId } });
    const day = DateTime.fromJSDate(start).setZone(clinic.timezone).toISODate()!;
    const slots = await findAvailableSlots({
      clinicId: input.clinicId,
      procedureId: procedure.id,
      dentistId: dentist.id,
      fromDay: day,
      days: 1,
      now: input.now,
      excludeAppointmentId: input.replacesAppointmentId,
    });
    if (!slots.some((s) => s.start.getTime() === start.getTime())) {
      throw new SchedulingError("NOT_AVAILABLE", "Horário indisponível");
    }
  }

  return withSerializableRetry(async (tx) => {
    const conflicts = await tx.appointment.findMany({
      where: {
        dentistId: dentist.id,
        status: { in: [...ACTIVE_STATUSES] },
        start: { lt: end },
        end: { gt: start },
        ...(input.replacesAppointmentId ? { id: { not: input.replacesAppointmentId } } : {}),
      },
      select: { id: true, start: true, end: true },
    });
    if (conflicts.some((c) => overlaps(start, end, c.start, c.end))) {
      throw new SchedulingError("SLOT_TAKEN", "Esse horário acabou de ser ocupado");
    }
    if (input.replacesAppointmentId) {
      await tx.appointment.update({
        where: { id: input.replacesAppointmentId, clinicId: input.clinicId, patientId: input.patientId },
        data: { status: "CANCELED", canceledAt: new Date(), notes: "Remarcada" },
      });
    }
    return tx.appointment.create({
      data: {
        clinicId: input.clinicId,
        patientId: patient.id,
        dentistId: dentist.id,
        procedureId: procedure.id,
        start,
        end,
        source: input.source,
        notes: input.notes ?? null,
      },
      include: { procedure: true, dentist: true, patient: true },
    });
  });
}

/** Consultas futuras do paciente (para o robô e o painel). */
export async function upcomingAppointments(clinicId: string, patientId: string, now = new Date()) {
  return db.appointment.findMany({
    where: { clinicId, patientId, status: { in: ["SCHEDULED", "CONFIRMED"] }, start: { gte: now } },
    include: { procedure: true, dentist: true },
    orderBy: { start: "asc" },
    take: 10,
  });
}

export async function setAppointmentStatus(
  clinicId: string,
  appointmentId: string,
  status: "CONFIRMED" | "CANCELED" | "COMPLETED" | "NO_SHOW" | "SCHEDULED",
  patientId?: string,
) {
  const appt = await db.appointment.findFirst({
    where: { id: appointmentId, clinicId, ...(patientId ? { patientId } : {}) },
  });
  if (!appt) throw new SchedulingError("NOT_FOUND", "Consulta não encontrada");
  return db.appointment.update({
    where: { id: appt.id },
    data: { status, canceledAt: status === "CANCELED" ? new Date() : null },
    include: { procedure: true, dentist: true, patient: true },
  });
}
