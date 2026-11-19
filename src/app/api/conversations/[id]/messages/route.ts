import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { apiUser, badRequest, unauthorized } from "@/lib/api";
import { sendToPatient } from "@/lib/whatsapp/outbound";

/** Mensagem enviada por alguém da equipe. Pausa o robô (modo humano). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await apiUser();
  if (!user) return unauthorized();
  const { id } = await params;
  const { body } = (await req.json()) as { body?: string };
  if (!body?.trim()) return badRequest("Mensagem vazia");
  const conversation = await db.conversation.findFirst({
    where: { id, clinicId: user.clinicId },
    include: { patient: true },
  });
  if (!conversation) return badRequest("Conversa não encontrada", 404);
  if (conversation.status !== "HUMAN") {
    await db.conversation.update({ where: { id }, data: { status: "HUMAN" } });
  }
  const message = await sendToPatient({ clinic: user.clinic, conversation, body: body.trim(), sender: "STAFF" });
  return NextResponse.json({ message });
}
