import { db } from "./db";

const SHORT = ["", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

function toMin(hm: string) {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + (m || 0);
}
function toHM(min: number) {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

/** Resume o horário de funcionamento a partir do expediente dos profissionais ativos. */
export function summarizeHours(hours: { weekday: number; start: string; end: string }[]): string {
  const perDay = new Map<number, string>();
  for (let wd = 1; wd <= 7; wd++) {
    const h = hours.filter((x) => x.weekday === wd);
    if (!h.length) continue;
    const start = Math.min(...h.map((x) => toMin(x.start)));
    const end = Math.max(...h.map((x) => toMin(x.end)));
    perDay.set(wd, `${toHM(start)} às ${toHM(end)}`);
  }
  const parts: string[] = [];
  let wd = 1;
  while (wd <= 7) {
    const v = perDay.get(wd);
    if (!v) {
      wd++;
      continue;
    }
    let endWd = wd;
    while (endWd + 1 <= 7 && perDay.get(endWd + 1) === v) endWd++;
    parts.push(`${endWd > wd ? `${SHORT[wd]} a ${SHORT[endWd]}` : SHORT[wd]}: ${v}`);
    wd = endWd + 1;
  }
  return parts.join(" | ") || "Horário não informado";
}

export async function clinicHoursSummary(clinicId: string) {
  const hours = await db.workingHour.findMany({ where: { dentist: { clinicId, active: true } } });
  return summarizeHours(hours);
}
