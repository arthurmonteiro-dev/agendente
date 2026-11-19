import { DateTime } from "luxon";

/**
 * Motor de disponibilidade — função pura, sem acesso a banco.
 * Recebe expediente dos dentistas + ocupações e devolve horários livres.
 */

export interface WorkingInterval {
  weekday: number; // 1 = segunda ... 7 = domingo
  start: string; // "08:00"
  end: string; // "12:00"
}

export interface DentistAvailabilityInput {
  id: string;
  workingHours: WorkingInterval[];
}

export interface BusyBlock {
  dentistId: string | null; // null = clínica toda
  start: Date;
  end: Date;
}

export interface SlotQuery {
  tz: string;
  fromDay: string; // "2026-11-18" (data local da clínica)
  days: number;
  durationMin: number;
  stepMin: number;
  now: Date;
  minNoticeMin: number;
  dentists: DentistAvailabilityInput[];
  busy: BusyBlock[];
}

export interface Slot {
  dentistId: string;
  start: Date;
  end: Date;
}

function parseHM(hm: string): { hour: number; minute: number } {
  const [h, m] = hm.split(":").map(Number);
  return { hour: h || 0, minute: m || 0 };
}

export function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart < bEnd && bStart < aEnd;
}

export function computeSlots(q: SlotQuery): Slot[] {
  const slots: Slot[] = [];
  const earliest = q.now.getTime() + q.minNoticeMin * 60_000;
  const first = DateTime.fromISO(q.fromDay, { zone: q.tz }).startOf("day");
  const durMs = q.durationMin * 60_000;

  const busyByDentist = new Map<string, BusyBlock[]>();
  const clinicBusy: BusyBlock[] = [];
  for (const b of q.busy) {
    if (b.dentistId == null) clinicBusy.push(b);
    else {
      const list = busyByDentist.get(b.dentistId) ?? [];
      list.push(b);
      busyByDentist.set(b.dentistId, list);
    }
  }

  for (let i = 0; i < q.days; i++) {
    const day = first.plus({ days: i });
    for (const dentist of q.dentists) {
      const busy = [...(busyByDentist.get(dentist.id) ?? []), ...clinicBusy];
      const intervals = dentist.workingHours.filter((w) => w.weekday === day.weekday);
      for (const w of intervals) {
        const ws = day.set({ ...parseHM(w.start), second: 0, millisecond: 0 });
        const we = day.set({ ...parseHM(w.end), second: 0, millisecond: 0 });
        for (let t = ws; t.toMillis() + durMs <= we.toMillis(); t = t.plus({ minutes: q.stepMin })) {
          const start = t.toJSDate();
          if (start.getTime() < earliest) continue;
          const end = new Date(start.getTime() + durMs);
          if (busy.some((b) => overlaps(start, end, b.start, b.end))) continue;
          slots.push({ dentistId: dentist.id, start, end });
        }
      }
    }
  }

  slots.sort((a, b) => a.start.getTime() - b.start.getTime() || a.dentistId.localeCompare(b.dentistId));
  return slots;
}

/** Para "sem preferência de dentista": um slot por horário (primeiro dentista livre). */
export function dedupeByStart(slots: Slot[]): Slot[] {
  const seen = new Set<number>();
  const out: Slot[] = [];
  for (const s of slots) {
    const k = s.start.getTime();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out;
}

/** Agrupa slots por dia local ("2026-11-18"). */
export function groupByDay(slots: Slot[], tz: string): Map<string, Slot[]> {
  const map = new Map<string, Slot[]>();
  for (const s of slots) {
    const key = DateTime.fromJSDate(s.start).setZone(tz).toISODate()!;
    const list = map.get(key) ?? [];
    list.push(s);
    map.set(key, list);
  }
  return map;
}
