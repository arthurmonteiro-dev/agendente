import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { apiUser, badRequest, unauthorized } from "@/lib/api";
import { normalizePhone, phoneVariants } from "@/lib/phone";
import { handleInbound } from "@/lib/whatsapp/inbound";

/** Simulador: conversa com o robô como se fosse um paciente, sem WhatsApp real. */
export async function GET(req: NextRequest) {
  const user = await apiUser();
  if (!user) return unauthorized();
  const phone = req.nextUrl.searchParams.get("phone") || "";
  const patient = await db.patient.findFirst({ where: { clinicId: user.clinicId, phone: { in: phoneVariants(phone) } } });
  if (!patient) return NextResponse.json({ messages: [], status: null });
  const conversation = await db.conversation.findFirst({
    where: { clinicId: user.clinicId, patientId: patient.id },
    include: { messages: { orderBy: { createdAt: "asc" }, take: 200 } },
  });
  return NextResponse.json({ messages: conversation?.messages ?? [], status: conversation?.status ?? null });
}

export async function POST(req: NextRequest) {
  const user = await apiUser();
  if (!user) return unauthorized();
  const { phone, text, reset } = (await req.json()) as { phone?: string; text?: string; reset?: boolean };
  const normalized = normalizePhone(phone || "");
  if (normalized.length < 12) return badRequest("Telefone inválido");

  if (reset) {
    const patient = await db.patient.findFirst({ where: { clinicId: user.clinicId, phone: { in: phoneVariants(normalized) } } });
    if (patient) {
      const conv = await db.conversation.findFirst({ where: { clinicId: user.clinicId, patientId: patient.id } });
      if (conv?.channel === "SIMULATOR") {
        await db.message.deleteMany({ where: { conversationId: conv.id } });
        await db.conversation.update({ where: { id: conv.id }, data: { status: "BOT", botState: { step: "idle" }, unread: 0 } });
      }
    }
    return NextResponse.json({ ok: true });
  }

  if (!text?.trim()) return badRequest("Mensagem vazia");
  const existing = await db.patient.findFirst({
    where: { clinicId: user.clinicId, phone: { in: phoneVariants(normalized) } },
    include: { conversations: true },
  });
  if (existing?.conversations.some((c) => c.channel === "WHATSAPP")) {
    return badRequest("Esse número já tem conversa real no WhatsApp. Use outro número no simulador.");
  }
  const result = await handleInbound({ clinic: user.clinic, channel: "SIMULATOR", from: normalized, text });
  return NextResponse.json(result);
}
