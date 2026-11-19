import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { apiUser, badRequest, unauthorized } from "@/lib/api";
import { SchedulingError, setAppointmentStatus } from "@/lib/scheduling";

const STATUSES = ["SCHEDULED", "CONFIRMED", "COMPLETED", "CANCELED", "NO_SHOW"] as const;

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await apiUser();
  if (!user) return unauthorized();
  const { id } = await params;
  const body = (await req.json()) as { status?: string; notes?: string };
  const exists = await db.appointment.count({ where: { id, clinicId: user.clinicId } });
  if (!exists) return badRequest("Consulta não encontrada", 404);
  if (body.notes !== undefined) {
    await db.appointment.update({ where: { id, clinicId: user.clinicId }, data: { notes: String(body.notes).slice(0, 2000) } });
  }
  if (body.status) {
    if (!STATUSES.includes(body.status as (typeof STATUSES)[number])) return badRequest("Status inválido");
    try {
      const appt = await setAppointmentStatus(user.clinicId, id, body.status as (typeof STATUSES)[number]);
      return NextResponse.json({ appointment: appt });
    } catch (e) {
      if (e instanceof SchedulingError) return badRequest(e.message, 404);
      throw e;
    }
  }
  return NextResponse.json({ ok: true });
}
