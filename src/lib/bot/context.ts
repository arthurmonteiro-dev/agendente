import type { Clinic, Conversation, Patient } from "@prisma/client";
import type { BotState } from "./state";

export interface BotContext {
  clinic: Clinic;
  conversation: Conversation;
  patient: Patient;
  state: BotState;
  now: Date;
  /** Marcar true quando o robô transferir para a equipe. */
  handoff?: boolean;
}

export function aiConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}
