import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { apiUser, badRequest, unauthorized } from "@/lib/api";
import { upcomingAppointments } from "@/lib/scheduling";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const user = await apiUser();
  if (!user) return unauthorized();
  const { id } = await params;
  const conversation = await db.conversation.findFirst({
    where: { id, clinicId: user.clinicId },
    include: { patient: true, messages: { orderBy: { createdAt: "asc" }, take: 300 } },
  });
  if (!conversation) return badRequest("Conversa não encontrada", 404);
  if (conversation.unread) await db.conversation.update({ where: { id }, data: { unread: 0 } });
  const appointments = await upcomingAppointments(user.clinicId, conversation.patientId);
  return NextResponse.json({ conversation, appointments });
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const user = await apiUser();
  if (!user) return unauthorized();
  const { id } = await params;
  const { status } = (await req.json()) as { status?: string };
  if (status !== "BOT" && status !== "HUMAN" && status !== "CLOSED") return badRequest("Status inválido");
  const conv = await db.conversation.findFirst({ where: { id, clinicId: user.clinicId } });
  if (!conv) return badRequest("Conversa não encontrada", 404);
  const updated = await db.conversation.update({
    where: { id },
    data: { status, ...(status !== "HUMAN" ? { botState: { step: "idle" } } : {}) },
  });
  return NextResponse.json({ conversation: updated });
}
