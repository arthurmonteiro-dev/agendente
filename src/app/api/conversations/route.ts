import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { apiUser, unauthorized } from "@/lib/api";

export async function GET(req: NextRequest) {
  const user = await apiUser();
  if (!user) return unauthorized();
  const filter = req.nextUrl.searchParams.get("status");
  const q = req.nextUrl.searchParams.get("q")?.trim();
  const conversations = await db.conversation.findMany({
    where: {
      clinicId: user.clinicId,
      ...(filter === "HUMAN" || filter === "BOT" || filter === "CLOSED" ? { status: filter } : {}),
      ...(q ? { patient: { OR: [{ name: { contains: q, mode: "insensitive" } }, { phone: { contains: q.replace(/\D/g, "") || q } }] } } : {}),
    },
    include: {
      patient: { select: { id: true, name: true, phone: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1, select: { body: true, sender: true, createdAt: true } },
    },
    orderBy: { lastMessageAt: "desc" },
    take: 100,
  });
  return NextResponse.json({
    conversations: conversations.map((c) => ({
      id: c.id,
      status: c.status,
      channel: c.channel,
      unread: c.unread,
      lastMessageAt: c.lastMessageAt,
      patient: c.patient,
      lastMessage: c.messages[0] ?? null,
    })),
  });
}
