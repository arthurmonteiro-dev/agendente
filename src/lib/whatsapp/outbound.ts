import type { Clinic, Conversation, Sender } from "@prisma/client";
import { db } from "../db";
import { getProvider, type TemplateMessage } from "./providers";

export interface OutboundOptions {
  clinic: Clinic;
  conversation: Conversation & { patient: { phone: string } };
  body: string;
  sender: Exclude<Sender, "PATIENT">;
  template?: TemplateMessage;
}

/** Registra a mensagem no banco e envia pelo provedor da clínica. */
export async function sendToPatient(opts: OutboundOptions) {
  const { clinic, conversation, body, sender } = opts;
  const msg = await db.message.create({
    data: {
      clinicId: clinic.id,
      conversationId: conversation.id,
      direction: "OUT",
      sender,
      body,
      status: "PENDING",
    },
  });

  const provider = getProvider(clinic, conversation.channel);
  const result =
    opts.template && provider.sendTemplate
      ? await provider.sendTemplate(conversation.patient.phone, opts.template)
      : await provider.sendText(conversation.patient.phone, body);

  if (!result.ok) console.error(`[whatsapp] falha ao enviar para conversa ${conversation.id}: ${result.error}`);

  const [updated] = await db.$transaction([
    db.message.update({
      where: { id: msg.id },
      data: {
        status: result.ok ? "SENT" : "FAILED",
        error: result.ok ? null : result.error?.slice(0, 500),
        waMessageId: result.providerMessageId ?? null,
      },
    }),
    db.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: new Date() } }),
  ]);
  return updated;
}
