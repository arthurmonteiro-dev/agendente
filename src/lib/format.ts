import type { AppointmentStatus } from "@prisma/client";

export const STATUS_LABEL: Record<AppointmentStatus, string> = {
  SCHEDULED: "Agendada",
  CONFIRMED: "Confirmada",
  COMPLETED: "Concluída",
  CANCELED: "Cancelada",
  NO_SHOW: "Faltou",
};

export const STATUS_STYLE: Record<AppointmentStatus, string> = {
  SCHEDULED: "bg-amber-100 text-amber-800 border-amber-300",
  CONFIRMED: "bg-emerald-100 text-emerald-800 border-emerald-300",
  COMPLETED: "bg-sky-100 text-sky-800 border-sky-300",
  CANCELED: "bg-zinc-100 text-zinc-500 border-zinc-300 line-through",
  NO_SHOW: "bg-rose-100 text-rose-800 border-rose-300",
};

export function formatMoney(cents: number | null | undefined): string {
  if (cents == null) return "";
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export function firstName(name?: string | null): string {
  return (name || "").trim().split(/\s+/)[0] || "";
}
