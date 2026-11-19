export type BotState =
  | { step: "idle" }
  | { step: "ask_name" }
  | { step: "menu" }
  | { step: "choose_procedure"; options: string[]; rescheduleId?: string }
  | { step: "choose_dentist"; procedureId: string; options: (string | null)[]; rescheduleId?: string }
  | { step: "choose_day"; procedureId: string; dentistId: string | null; options: string[]; nextFrom?: string; rescheduleId?: string }
  | {
      step: "choose_time";
      procedureId: string;
      dentistId: string | null;
      day: string;
      options: { start: string; dentistId: string }[];
      rescheduleId?: string;
    }
  | { step: "confirm_booking"; procedureId: string; dentistId: string; start: string; rescheduleId?: string }
  | { step: "my_appointments"; options: string[] }
  | { step: "appointment_action"; appointmentId: string }
  | { step: "confirm_cancel"; appointmentId: string }
  | { step: "awaiting_confirmation"; appointmentId: string }
  | { step: "awaiting_rating"; appointmentId: string }
  | { step: "recall_offer" };

export function readState(raw: unknown): BotState {
  if (raw && typeof raw === "object" && "step" in raw && typeof (raw as { step: unknown }).step === "string") {
    return raw as BotState;
  }
  return { step: "idle" };
}

const KEYCAPS: Record<string, number> = {
  "0️⃣": 0, "1️⃣": 1, "2️⃣": 2, "3️⃣": 3, "4️⃣": 4, "5️⃣": 5, "6️⃣": 6, "7️⃣": 7, "8️⃣": 8, "9️⃣": 9, "🔟": 10,
};

/** Interpreta "1", "1.", "opção 2", "2️⃣" como número de opção. */
export function parseChoice(text: string): number | null {
  const t = text.trim();
  if (t in KEYCAPS) return KEYCAPS[t];
  const m = t.match(/^(?:op[çc][aã]o\s*)?(\d{1,2})(?:\s*[-.)]?\s*)?$/i);
  return m ? Number(m[1]) : null;
}

export function normalizeText(text: string) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export const YES = /^(1|sim|s|confirmo|confirmar|confirmado|ok|okay|pode ser|isso|claro|beleza|👍|✅)[!. ]*$/i;
export const NO = /^(2|nao|n|negativo)[!. ]*$/i;
