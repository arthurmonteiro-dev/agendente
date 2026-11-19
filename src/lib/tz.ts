import { DateTime } from "luxon";

export const DEFAULT_TZ = "America/Sao_Paulo";

const WEEKDAYS = ["", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado", "domingo"];
const WEEKDAYS_SHORT = ["", "seg", "ter", "qua", "qui", "sex", "sáb", "dom"];

export function inTz(date: Date | string, tz: string): DateTime {
  const d = typeof date === "string" ? DateTime.fromISO(date) : DateTime.fromJSDate(date);
  return d.setZone(tz);
}

export function weekdayName(dt: DateTime, short = false): string {
  return (short ? WEEKDAYS_SHORT : WEEKDAYS)[dt.weekday];
}

/** "terça-feira, 18/11" */
export function formatDay(date: Date | string, tz: string): string {
  const dt = inTz(date, tz);
  return `${weekdayName(dt)}, ${dt.toFormat("dd/MM")}`;
}

/** "18/11/2026" */
export function formatDate(date: Date | string, tz: string): string {
  return inTz(date, tz).toFormat("dd/MM/yyyy");
}

/** "14:30" */
export function formatTime(date: Date | string, tz: string): string {
  return inTz(date, tz).toFormat("HH:mm");
}

/** "terça-feira, 18/11 às 14:30" */
export function formatDayTime(date: Date | string, tz: string): string {
  return `${formatDay(date, tz)} às ${formatTime(date, tz)}`;
}

/** Converte "2026-11-18" + "14:30" no fuso da clínica para Date (UTC). */
export function localToDate(day: string, time: string, tz: string): Date {
  const dt = DateTime.fromISO(`${day}T${time}`, { zone: tz });
  if (!dt.isValid) throw new Error(`Data/hora inválida: ${day} ${time}`);
  return dt.toJSDate();
}

/** Converte valor de <input type="datetime-local"> no fuso da clínica. */
export function datetimeLocalToDate(value: string, tz: string): Date {
  const dt = DateTime.fromISO(value, { zone: tz });
  if (!dt.isValid) throw new Error(`Data/hora inválida: ${value}`);
  return dt.toJSDate();
}

export function dateToDatetimeLocal(date: Date, tz: string): string {
  return inTz(date, tz).toFormat("yyyy-MM-dd'T'HH:mm");
}

export function todayISO(tz: string, now = new Date()): string {
  return inTz(now, tz).toISODate()!;
}
