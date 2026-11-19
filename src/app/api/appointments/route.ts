import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiUser, badRequest, unauthorized } from "@/lib/api";
import { bookAppointment, SchedulingError } from "@/lib/scheduling";
import { normalizePhone } from "@/lib/phone";
import { findOrCreatePatient } from "@/lib/whatsapp/inbound";
import { localToDate } from "@/lib/tz";

const Body = z.object({
  patientId: z.string().optional(),
  newPatient: z.object({ name: z.string().min(2), phone: z.string().min(8) }).optional(),
  procedureId: z.string(),
  dentistId: z.string(),
  start: z.string().optional(),
  startLocal: z.object({ day: z.string(), time: z.string() }).optional(),
  notes: z.string().optional(),
  allowOutsideHours: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const user = await apiUser();
  if (!user) return unauthorized();
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return badRequest("Dados inválidos");
  const b = parsed.data;

  let patientId = b.patientId;
  if (patientId && !(await db.patient.count({ where: { id: patientId, clinicId: user.clinicId } }))) {
    return badRequest("Paciente não encontrado", 404);
  }
  if (!patientId && b.newPatient) {
    const p = await findOrCreatePatient(user.clinicId, normalizePhone(b.newPatient.phone));
    if (!p.name) await db.patient.update({ where: { id: p.id }, data: { name: b.newPatient.name.trim() } });
    patientId = p.id;
  }
  if (!patientId) return badRequest("Selecione ou cadastre o paciente");

  let start: Date;
  try {
    start = b.start ? new Date(b.start) : b.startLocal ? localToDate(b.startLocal.day, b.startLocal.time, user.clinic.timezone) : new Date(NaN);
  } catch {
    return badRequest("Data/hora inválida");
  }
  if (Number.isNaN(start.getTime())) return badRequest("Informe o horário");

  try {
    const appt = await bookAppointment({
      clinicId: user.clinicId,
      patientId,
      procedureId: b.procedureId,
      dentistId: b.dentistId,
      start,
      source: "STAFF",
      notes: b.notes,
      allowOutsideHours: b.allowOutsideHours ?? true,
    });
    return NextResponse.json({ appointment: appt });
  } catch (e) {
    if (e instanceof SchedulingError) return badRequest(e.message, e.code === "NOT_FOUND" ? 404 : 409);
    throw e;
  }
}
