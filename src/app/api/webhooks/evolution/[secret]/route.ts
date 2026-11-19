import { after, NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handleInbound } from "@/lib/whatsapp/inbound";

/**
 * Webhook da Evolution API. Configure na instância:
 * URL = {APP_URL}/api/webhooks/evolution/{webhookSecret da clínica}, evento MESSAGES_UPSERT.
 */

type EvoPayload = {
  event?: string;
  data?: {
    key?: { remoteJid?: string; fromMe?: boolean; id?: string };
    message?: { conversation?: string; extendedTextMessage?: { text?: string }; buttonsResponseMessage?: { selectedDisplayText?: string } };
    messageType?: string;
  };
};

export async function POST(req: NextRequest, { params }: { params: Promise<{ secret: string }> }) {
  const { secret } = await params;
  const clinic = await db.clinic.findUnique({ where: { webhookSecret: secret } });
  if (!clinic) return new NextResponse("Not found", { status: 404 });

  const body = (await req.json().catch(() => ({}))) as EvoPayload;
  const event = (body.event || "").toLowerCase().replace("_", ".");
  const d = body.data;
  if (event !== "messages.upsert" || !d?.key?.remoteJid || d.key.fromMe) return NextResponse.json({ ok: true });
  if (!d.key.remoteJid.endsWith("@s.whatsapp.net")) return NextResponse.json({ ok: true }); // ignora grupos

  const text =
    d.message?.conversation ??
    d.message?.extendedTextMessage?.text ??
    d.message?.buttonsResponseMessage?.selectedDisplayText ??
    (d.messageType ? `[${d.messageType}]` : "");
  const from = d.key.remoteJid.split("@")[0];

  after(async () => {
    try {
      await handleInbound({ clinic, channel: "WHATSAPP", from, text, providerMessageId: d.key?.id ? `evo:${d.key.id}` : null });
    } catch (e) {
      console.error("[evolution] erro ao processar", e);
    }
  });
  return NextResponse.json({ ok: true });
}
