import { NextResponse, type NextRequest } from "next/server";
import { apiUser, badRequest, unauthorized } from "@/lib/api";
import { dedupeByStart, findAvailableSlots, SchedulingError } from "@/lib/scheduling";
import { formatTime } from "@/lib/tz";

export async function GET(req: NextRequest) {
  const user = await apiUser();
  if (!user) return unauthorized();
  const p = req.nextUrl.searchParams;
  const procedureId = p.get("procedureId");
  const day = p.get("day");
  if (!procedureId || !day) return badRequest("Informe procedimento e dia");
  let slots;
  try {
    slots = await findAvailableSlots({
    clinicId: user.clinicId,
    procedureId,
    dentistId: p.get("dentistId") || null,
    fromDay: day,
    days: 1,
    now: new Date(Date.now() - user.clinic.minNoticeHours * 3_600_000), // equipe ignora antecedência mínima
    });
  } catch (e) {
    if (e instanceof SchedulingError) return badRequest(e.message, 404);
    throw e;
  }
  if (!p.get("dentistId")) slots = dedupeByStart(slots);
  return NextResponse.json({
    slots: slots.map((s) => ({ start: s.start, dentistId: s.dentistId, label: formatTime(s.start, user.clinic.timezone) })),
  });
}
