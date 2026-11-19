import { Prisma, type Channel, type Clinic } from "@prisma/client";
import { db } from "../db";
import { normalizePhone, phoneVariants } from "../phone";
import { firstName } from "../format";
import { formatDayTime } from "../tz";
import { setAppointmentStatus } from "../scheduling";
import { aiConfigured, type BotContext } from "../bot/context";
import { menuBot } from "../bot/menu";
import { aiBot } from "../bot/ai";
import { normalizeText, readState, YES } from "../bot/state";
import { sendToPatient } from "./outbound";

export interface InboundMessage {
  clinic: Clinic;
  channel: Channel;
  from: string;
  text: string;
  providerMessageId?: string | null;
  now?: Date;
}

// Fila por conversa: processa mensagens do mesmo paciente em ordem (por instância).
const queues = new Map<string, Promise<unknown>>();
function enqueue<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = queues.get(key) ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(fn);
  queues.set(key, next);
  next.finally(() => {
    if (queues.get(key) === next) queues.delete(key);
  });
  return next;
}

export async function findOrCreatePatient(clinicId: string, phone: string) {
  const variants = phoneVariants(phone);
  const existing = await db.patient.findFirst({ where: { clinicId, phone: { in: variants } } });
  if (existing) return existing;
  try {
    return await db.patient.create({ data: { clinicId, phone: normalizePhone(phone) } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return db.patient.findFirstOrThrow({ where: { clinicId, phone: { in: variants } } });
    }
    throw e;
  }
}

export async function getOrCreateConversation(clinicId: string, patientId: string, channel: Channel) {
  return db.conversation.upsert({
    where: { clinicId_patientId: { clinicId, patientId } },
    create: { clinicId, patientId, channel },
    update: {},
    include: { patient: true },
  });
}

/** Ponto de entrada de toda mensagem recebida (webhooks e simulador). */
export async function handleInbound(msg: InboundMessage): Promise<{ duplicate: boolean; replies: string[] }> {
  const now = msg.now ?? new Date();
  const text = (msg.text || "").trim();
  const patient = await findOrCreatePatient(msg.clinic.id, msg.from);
  const conversation = await getOrCreateConversation(msg.clinic.id, patient.id, msg.channel);

  try {
    await db.message.create({
      data: {
        clinicId: msg.clinic.id,
        conversationId: conversation.id,
        direction: "IN",
        sender: "PATIENT",
        body: text || "[mensagem sem texto]",
        waMessageId: msg.providerMessageId || null,
        status: "RECEIVED",
        createdAt: now,
      },
    });
  } catch (e) {
    // Webhooks são reenviados pela Meta em caso de timeout: ignora duplicadas.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { duplicate: true, replies: [] };
    throw e;
  }

  await db.conversation.update({
    where: { id: conversation.id },
    data: {
      unread: { increment: 1 },
      lastMessageAt: now,
      lastInboundAt: now,
      ...(conversation.status === "CLOSED" ? { status: "BOT" } : {}),
    },
  });

  if (!text) return { duplicate: false, replies: [] };
  return enqueue(conversation.id, async () => ({ duplicate: false, replies: await processMessage(msg.clinic, conversation.id, text, now) }));
}

async function processMessage(clinic: Clinic, conversationId: string, text: string, now: Date): Promise<string[]> {
  const conversation = await db.conversation.findUniqueOrThrow({
    where: { id: conversationId },
    include: { patient: true },
  });
  const norm = normalizeText(text);

  // Opt-out / opt-in de mensagens automáticas (LGPD)
  if (/^(sair|parar|stop|descadastrar)$/.test(norm)) {
    await db.patient.update({ where: { id: conversation.patient.id }, data: { optOut: true } });
    return reply(clinic, conversation, [
      "Pronto! Você não receberá mais mensagens automáticas (lembretes e campanhas). " +
        "Para voltar a receber, envie *RECEBER*. Você continua podendo falar com a gente por aqui.",
    ]);
  }
  if (norm === "receber") {
    await db.patient.update({ where: { id: conversation.patient.id }, data: { optOut: false } });
    return reply(clinic, conversation, ["Combinado! Você voltará a receber nossos lembretes. 😊"]);
  }

  if (!clinic.botEnabled) return [];

  // Atendimento humano: o robô fica em silêncio, exceto após o tempo limite sem resposta da equipe.
  if (conversation.status === "HUMAN") {
    // Referência: última mensagem da equipe (ou do robô, no momento da transferência).
    const lastOut = await db.message.findFirst({
      where: { conversationId, sender: { in: ["STAFF", "BOT"] } },
      orderBy: { createdAt: "desc" },
    });
    const since = lastOut?.createdAt ?? conversation.createdAt;
    const expired = now.getTime() - since.getTime() > clinic.humanTimeoutHours * 3_600_000;
    if (!expired) return [];
    await db.conversation.update({ where: { id: conversationId }, data: { status: "BOT", botState: { step: "idle" } } });
    conversation.status = "BOT";
    conversation.botState = { step: "idle" };
  }

  const ctx: BotContext = {
    clinic,
    conversation,
    patient: conversation.patient,
    state: readState(conversation.botState),
    now,
  };

  const quick = await handlePendingAnswers(ctx, norm);
  let replies: string[];
  if (quick) {
    replies = quick;
  } else if (clinic.botMode === "AI" && aiConfigured()) {
    try {
      replies = await aiBot(ctx);
      if (ctx.state.step === "awaiting_confirmation" || ctx.state.step === "recall_offer") ctx.state = { step: "idle" };
    } catch (e) {
      console.error("[ai] falha, usando robô de menu", e);
      replies = await menuBot(ctx, text);
    }
  } else {
    replies = await menuBot(ctx, text);
  }

  await db.conversation.update({
    where: { id: conversationId },
    data: {
      botState: ctx.state as unknown as Prisma.InputJsonValue,
      ...(ctx.handoff ? { status: "HUMAN" } : {}),
    },
  });
  return reply(clinic, conversation, replies);
}

/** Respostas a lembretes e pesquisas, iguais nos dois modos (menu e IA). */
async function handlePendingAnswers(ctx: BotContext, norm: string): Promise<string[] | null> {
  const s = ctx.state;
  const tz = ctx.clinic.timezone;
  if (s.step === "awaiting_confirmation" && YES.test(norm)) {
    try {
      const appt = await setAppointmentStatus(ctx.clinic.id, s.appointmentId, "CONFIRMED", ctx.patient.id);
      ctx.state = { step: "menu" };
      return [
        `Consulta confirmada ✅ Te esperamos ${formatDayTime(appt.start, tz)}, ${firstName(ctx.patient.name) || ""}!`.replace(
          ", !",
          "!",
        ),
      ];
    } catch {
      ctx.state = { step: "idle" };
      return null;
    }
  }
  if (s.step === "awaiting_rating") {
    const m = norm.match(/^([1-5])(\s*(estrelas?|\/5))?[!. ]*$/);
    if (!m) {
      ctx.state = { step: "idle" };
      return null;
    }
    const rating = Number(m[1]);
    await db.appointment.updateMany({
      where: { id: s.appointmentId, patientId: ctx.patient.id },
      data: { rating },
    });
    ctx.state = { step: "idle" };
    if (rating <= 3) {
      ctx.handoff = true;
      return [
        "Obrigado pela sinceridade. Sentimos muito que sua experiência não foi a ideal 😔 " +
          "Uma pessoa da nossa equipe vai falar com você para entender como podemos melhorar.",
      ];
    }
    return ["Muito obrigado pela avaliação! 💙 Ficamos felizes em cuidar do seu sorriso."];
  }
  return null;
}

async function reply(
  clinic: Clinic,
  conversation: Awaited<ReturnType<typeof getOrCreateConversation>>,
  replies: string[],
) {
  for (const body of replies) {
    if (body.trim()) await sendToPatient({ clinic, conversation, body, sender: "BOT" });
  }
  return replies;
}
