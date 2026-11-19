import { DateTime } from "luxon";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatPhone } from "@/lib/phone";
import { AgendaClient, type AgendaAppointment, type AgendaBlock } from "./AgendaClient";

export const metadata = { title: "Agenda" };

function toMin(hm: string) {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + (m || 0);
}

export default async function AgendaPage({ searchParams }: PageProps<"/painel/agenda">) {
  const user = await requireUser();
  const sp = await searchParams;
  const tz = user.clinic.timezone;
  const today = DateTime.now().setZone(tz).startOf("day");
  const requested = typeof sp.semana === "string" ? DateTime.fromISO(sp.semana, { zone: tz }) : today;
  const weekStart = (requested.isValid ? requested : today).startOf("week"); // segunda-feira
  const weekEnd = weekStart.plus({ days: 7 });
  const dentistFilter = typeof sp.dentista === "string" && sp.dentista ? sp.dentista : null;

  const [dentists, procedures, appointments, timeOffs] = await Promise.all([
    db.dentist.findMany({
      where: { clinicId: user.clinicId, active: true },
      include: { workingHours: true },
      orderBy: { name: "asc" },
    }),
    db.procedure.findMany({
      where: { clinicId: user.clinicId, active: true },
      include: { dentists: { select: { id: true } } },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    db.appointment.findMany({
      where: {
        clinicId: user.clinicId,
        start: { gte: weekStart.toJSDate(), lt: weekEnd.toJSDate() },
        status: { not: "CANCELED" },
        ...(dentistFilter ? { dentistId: dentistFilter } : {}),
      },
      include: { patient: { include: { conversations: { select: { id: true } } } }, procedure: true, dentist: true },
      orderBy: { start: "asc" },
    }),
    db.timeOff.findMany({
      where: {
        clinicId: user.clinicId,
        start: { lt: weekEnd.toJSDate() },
        end: { gt: weekStart.toJSDate() },
        ...(dentistFilter ? { OR: [{ dentistId: null }, { dentistId: dentistFilter }] } : {}),
      },
      include: { dentist: true },
    }),
  ]);

  const visibleDentists = dentistFilter ? dentists.filter((d) => d.id === dentistFilter) : dentists;
  const hours = visibleDentists.flatMap((d) => d.workingHours);
  let gridStart = hours.length ? Math.min(...hours.map((h) => toMin(h.start))) : 8 * 60;
  let gridEnd = hours.length ? Math.max(...hours.map((h) => toMin(h.end))) : 18 * 60;

  const mapped: AgendaAppointment[] = appointments.map((a) => {
    const s = DateTime.fromJSDate(a.start).setZone(tz);
    const e = DateTime.fromJSDate(a.end).setZone(tz);
    const startMin = s.hour * 60 + s.minute;
    const endMin = Math.max(startMin + 15, e.hasSame(s, "day") ? e.hour * 60 + e.minute : 24 * 60);
    gridStart = Math.min(gridStart, startMin);
    gridEnd = Math.max(gridEnd, endMin);
    return {
      id: a.id,
      day: s.toISODate()!,
      startMin,
      endMin,
      startISO: a.start.toISOString(),
      timeLabel: `${s.toFormat("HH:mm")}–${e.toFormat("HH:mm")}`,
      dateLabel: s.setLocale("pt-BR").toFormat("cccc, dd/MM"),
      status: a.status,
      source: a.source,
      notes: a.notes,
      rating: a.rating,
      patientName: a.patient.name || formatPhone(a.patient.phone),
      patientPhone: formatPhone(a.patient.phone),
      patientId: a.patient.id,
      conversationId: a.patient.conversations[0]?.id ?? null,
      procedureName: a.procedure.name,
      dentistName: a.dentist.name,
      color: a.dentist.color,
    };
  });

  const blocks: AgendaBlock[] = [];
  for (const t of timeOffs) {
    for (let i = 0; i < 7; i++) {
      const day = weekStart.plus({ days: i });
      const s = DateTime.max(DateTime.fromJSDate(t.start).setZone(tz), day);
      const e = DateTime.min(DateTime.fromJSDate(t.end).setZone(tz), day.plus({ days: 1 }));
      if (e <= s) continue;
      const startMin = s.hour * 60 + s.minute;
      const endMin = e.hasSame(day, "day") ? e.hour * 60 + e.minute : 24 * 60;
      blocks.push({
        id: `${t.id}-${i}`,
        day: day.toISODate()!,
        startMin: Math.max(startMin, gridStart),
        endMin: Math.min(endMin, gridEnd),
        label: `${t.reason || "Bloqueio"}${t.dentist ? ` · ${t.dentist.name}` : " · Clínica"}`,
      });
    }
  }

  gridStart = Math.floor(gridStart / 60) * 60;
  gridEnd = Math.ceil(gridEnd / 60) * 60;
  const hasSunday = hours.some((h) => h.weekday === 7) || mapped.some((a) => DateTime.fromISO(a.day).weekday === 7);
  const days = Array.from({ length: hasSunday ? 7 : 6 }, (_, i) => {
    const d = weekStart.plus({ days: i }).setLocale("pt-BR");
    return { iso: d.toISODate()!, label: d.toFormat("ccc"), date: d.toFormat("dd/MM"), isToday: d.hasSame(today, "day") };
  });

  return (
    <AgendaClient
      weekStart={weekStart.toISODate()!}
      prevWeek={weekStart.minus({ weeks: 1 }).toISODate()!}
      nextWeek={weekStart.plus({ weeks: 1 }).toISODate()!}
      weekLabel={`${weekStart.toFormat("dd/MM")} – ${weekStart.plus({ days: 6 }).toFormat("dd/MM/yyyy")}`}
      days={days}
      gridStart={gridStart}
      gridEnd={gridEnd}
      appointments={mapped}
      blocks={blocks}
      dentists={dentists.map((d) => ({ id: d.id, name: d.name, color: d.color }))}
      procedures={procedures.map((p) => ({ id: p.id, name: p.name, durationMin: p.durationMin, dentistIds: p.dentists.map((d) => d.id) }))}
      dentistFilter={dentistFilter}
      tz={tz}
    />
  );
}
