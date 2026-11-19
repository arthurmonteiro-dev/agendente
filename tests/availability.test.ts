import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import { computeSlots, dedupeByStart } from "@/lib/scheduling/availability";
import { summarizeHours } from "@/lib/clinic-info";

const tz = "America/Sao_Paulo";
const at = (iso: string) => DateTime.fromISO(iso, { zone: tz }).toJSDate();
const hm = (d: Date) => DateTime.fromJSDate(d).setZone(tz).toFormat("HH:mm");

const base = {
  tz,
  fromDay: "2026-11-17", // terça
  days: 1,
  durationMin: 60,
  stepMin: 30,
  now: at("2026-11-16T10:00"),
  minNoticeMin: 120,
  dentists: [{ id: "d1", workingHours: [{ weekday: 2, start: "08:00", end: "12:00" }] }],
  busy: [],
};

describe("computeSlots", () => {
  it("gera horários respeitando duração e passo", () => {
    expect(computeSlots(base).map((s) => hm(s.start))).toEqual(["08:00", "08:30", "09:00", "09:30", "10:00", "10:30", "11:00"]);
  });

  it("remove horários que conflitam com consultas", () => {
    const slots = computeSlots({ ...base, busy: [{ dentistId: "d1", start: at("2026-11-17T09:00"), end: at("2026-11-17T10:00") }] });
    expect(slots.map((s) => hm(s.start))).toEqual(["08:00", "10:00", "10:30", "11:00"]);
  });

  it("bloqueio da clínica inteira afeta todos os dentistas", () => {
    const slots = computeSlots({ ...base, busy: [{ dentistId: null, start: at("2026-11-17T00:00"), end: at("2026-11-18T00:00") }] });
    expect(slots).toHaveLength(0);
  });

  it("respeita antecedência mínima", () => {
    const slots = computeSlots({ ...base, now: at("2026-11-17T08:10") });
    expect(slots.map((s) => hm(s.start))).toEqual(["10:30", "11:00"]);
  });

  it("não oferece dias sem expediente", () => {
    expect(computeSlots({ ...base, fromDay: "2026-11-18" })).toHaveLength(0);
  });

  it("deduplica por horário quando não há preferência de dentista", () => {
    const slots = computeSlots({
      ...base,
      dentists: [base.dentists[0], { id: "d2", workingHours: [{ weekday: 2, start: "08:00", end: "09:00" }] }],
    });
    expect(slots.filter((s) => hm(s.start) === "08:00")).toHaveLength(2);
    expect(dedupeByStart(slots).filter((s) => hm(s.start) === "08:00")).toHaveLength(1);
  });
});

describe("summarizeHours", () => {
  it("agrupa dias iguais", () => {
    const hours = [1, 2, 3, 4, 5].flatMap((weekday) => [
      { weekday, start: "08:00", end: "12:00" },
      { weekday, start: "13:30", end: "18:00" },
    ]);
    hours.push({ weekday: 6, start: "08:00", end: "12:00" });
    expect(summarizeHours(hours)).toBe("Seg a Sex: 08:00 às 18:00 | Sáb: 08:00 às 12:00");
  });
});
