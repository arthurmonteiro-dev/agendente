import crypto from "node:crypto";
import { after, NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handleInbound } from "@/lib/whatsapp/inbound";

/**
 * Webhook da WhatsApp Cloud API (Meta).
 * Configure no app da Meta: URL = {APP_URL}/api/webhooks/whatsapp,
 * token de verificação = WHATSAPP_VERIFY_TOKEN, campo "messages".
 */

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  if (p.get("hub.mode") === "subscribe" && p.get("hub.verify_token") === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(p.get("hub.challenge") ?? "", { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

function validSignature(raw: string, header: string | null) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production"; // em produção a assinatura é obrigatória
  if (!header?.startsWith("sha256=")) return false;
  const expected = crypto.createHmac("sha256", secret).update(raw).digest("hex");
  const got = header.slice(7);
  return got.length === expected.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}

type WaMessage = {
  from: string;
  id: string;
  type: string;
  text?: { body: string };
  button?: { text: string };
  interactive?: { button_reply?: { title: string }; list_reply?: { title: string } };
};
type WaChange = {
  value?: {
    metadata?: { phone_number_id?: string };
    messages?: WaMessage[];
    statuses?: { id: string; status: string; errors?: { title?: string }[] }[];
  };
};

function messageText(m: WaMessage): string {
  switch (m.type) {
    case "text":
      return m.text?.body ?? "";
    case "button":
      return m.button?.text ?? "";
    case "interactive":
      return m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? "";
    case "audio":
      return "[áudio]";
    case "image":
      return "[imagem]";
    case "document":
      return "[documento]";
    case "location":
      return "[localização]";
    default:
      return `[${m.type}]`;
  }
}

const STATUS_MAP: Record<string, "SENT" | "DELIVERED" | "READ" | "FAILED"> = {
  sent: "SENT",
  delivered: "DELIVERED",
  read: "READ",
  failed: "FAILED",
};

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!validSignature(raw, req.headers.get("x-hub-signature-256"))) {
    return new NextResponse("Invalid signature", { status: 401 });
  }
  let body: { entry?: { changes?: WaChange[] }[] };
  try {
    body = JSON.parse(raw);
  } catch {
    return new NextResponse("Bad JSON", { status: 400 });
  }

  const changes = (body.entry ?? []).flatMap((e) => e.changes ?? []);

  // Responde 200 imediatamente; o processamento (robô/IA) roda depois da resposta.
  after(async () => {
    for (const change of changes) {
      const v = change.value;
      if (!v) continue;
      for (const s of v.statuses ?? []) {
        const status = STATUS_MAP[s.status];
        if (status) {
          await db.message.updateMany({
            where: { waMessageId: s.id },
            data: { status, ...(s.errors?.length ? { error: s.errors[0].title ?? "erro" } : {}) },
          });
        }
      }
      if (!v.messages?.length || !v.metadata?.phone_number_id) continue;
      const clinic = await db.clinic.findUnique({ where: { waPhoneNumberId: v.metadata.phone_number_id } });
      if (!clinic) {
        console.warn(`[webhook] phone_number_id sem clínica: ${v.metadata.phone_number_id}`);
        continue;
      }
      for (const m of v.messages) {
        try {
          await handleInbound({ clinic, channel: "WHATSAPP", from: m.from, text: messageText(m), providerMessageId: m.id });
        } catch (e) {
          console.error("[webhook] erro ao processar mensagem", e);
        }
      }
    }
  });

  return NextResponse.json({ ok: true });
}
