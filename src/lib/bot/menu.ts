import { DateTime } from "luxon";
import { db } from "../db";
import { firstName, formatMoney } from "../format";
import { formatDay, formatDayTime, formatTime } from "../tz";
import { clinicHoursSummary } from "../clinic-info";
import {
  bookAppointment,
  dedupeByStart,
  findAvailableSlots,
  groupByDay,
  SchedulingError,
  setAppointmentStatus,
  upcomingAppointments,
} from "../scheduling";
import type { BotContext } from "./context";
import { normalizeText, parseChoice, YES, type BotState } from "./state";

/**
 * Robô de menu (sem IA): máquina de estados com opções numeradas.
 * Funciona com qualquer provedor de WhatsApp e não tem custo por mensagem.
 */

const MENU_TEXT =
  "Como posso te ajudar? Responda com o número:\n\n" +
  "*1* - Agendar consulta\n" +
  "*2* - Minhas consultas (confirmar, remarcar ou cancelar)\n" +
  "*3* - Endereço, horários e formas de pagamento\n" +
  "*4* - Falar com a equipe";

const BACK = "\n\n*0* - Voltar ao menu";
const MAX_DAYS_SHOWN = 6;
const MAX_TIMES_SHOWN = 12;
const SEARCH_WINDOW_DAYS = 21;

const RX = {
  menu: /^(0|menu|inicio|voltar|oi|ola|bom dia|boa tarde|boa noite|recomecar)$/,
  schedule: /(agend|marcar|marca|horario|vaga|consulta nova)/,
  mine: /(minha|minhas|remarc|desmarc|cancel|confirm)/,
  info: /(endere|onde fica|localiza|funciona|pagamento|pix|cartao|convenio|plano|preco|valor|quanto custa)/,
  human: /(atendente|humano|pessoa|secretaria|recepcao|falar com)/,
};

function greeting(ctx: BotContext) {
  const name = firstName(ctx.patient.name);
  return `Olá${name ? `, ${name}` : ""}! 👋 Sou a ${ctx.clinic.botName}, assistente virtual da *${ctx.clinic.name}*.`;
}

function set(ctx: BotContext, state: BotState) {
  ctx.state = state;
}

export async function menuBot(ctx: BotContext, rawText: string): Promise<string[]> {
  const text = rawText.trim();
  const norm = normalizeText(text);
  const state = ctx.state;

  // Nome do paciente primeiro (cadastro mínimo)
  if (!ctx.patient.name && state.step !== "ask_name") {
    set(ctx, { step: "ask_name" });
    return [`${greeting(ctx)}\n\nPara começar, qual é o seu *nome completo*?`];
  }

  if (state.step === "ask_name") {
    const name = text.replace(/\s+/g, " ").trim();
    if (name.length < 2 || !/\p{L}/u.test(name) || name.length > 80) {
      return ["Por favor, me diga seu nome completo 🙂"];
    }
    const pretty = name
      .toLowerCase()
      .replace(/(^|\s)(\p{L})/gu, (_m, sp: string, ch: string) => sp + ch.toUpperCase())
      .replace(/\s(Da|De|Do|Das|Dos|E)\s/g, (m) => m.toLowerCase());
    ctx.patient = await db.patient.update({ where: { id: ctx.patient.id }, data: { name: pretty } });
    set(ctx, { step: "menu" });
    return [`Prazer, ${firstName(pretty)}! 😊\n\n${MENU_TEXT}`];
  }

  // Comandos globais
  if (RX.menu.test(norm) && state.step !== "idle") {
    set(ctx, { step: "menu" });
    return [`${norm === "0" || norm === "menu" || norm === "voltar" ? "" : greeting(ctx) + "\n\n"}${MENU_TEXT}`];
  }

  switch (state.step) {
    case "idle": {
      if (RX.schedule.test(norm)) return startScheduling(ctx);
      if (RX.mine.test(norm)) return myAppointments(ctx);
      if (RX.human.test(norm)) return handoff(ctx);
      set(ctx, { step: "menu" });
      return [`${greeting(ctx)}\n\n${MENU_TEXT}`];
    }

    case "menu":
    case "recall_offer":
    case "awaiting_confirmation":
    case "awaiting_rating":
      return handleMenuChoice(ctx, norm);

    case "choose_procedure": {
      const n = parseChoice(norm);
      let procedureId: string | undefined;
      if (n && n >= 1 && n <= state.options.length) procedureId = state.options[n - 1];
      if (!procedureId) {
        const procs = await db.procedure.findMany({ where: { id: { in: state.options } } });
        procedureId = procs.find((p) => normalizeText(p.name).includes(norm) && norm.length >= 4)?.id;
      }
      if (!procedureId) return ["Não entendi 😅 Responda com o número do procedimento." + BACK];
      return chooseDentist(ctx, procedureId, state.rescheduleId);
    }

    case "choose_dentist": {
      const n = parseChoice(norm);
      if (!n || n < 1 || n > state.options.length) return ["Responda com o número da opção desejada." + BACK];
      return chooseDay(ctx, state.procedureId, state.options[n - 1], undefined, state.rescheduleId);
    }

    case "choose_day": {
      const n = parseChoice(norm);
      if (n === state.options.length + 1 && state.nextFrom) {
        return chooseDay(ctx, state.procedureId, state.dentistId, state.nextFrom, state.rescheduleId);
      }
      if (!n || n < 1 || n > state.options.length) return ["Responda com o número do dia desejado." + BACK];
      return chooseTime(ctx, state.procedureId, state.dentistId, state.options[n - 1], state.rescheduleId);
    }

    case "choose_time": {
      const n = parseChoice(norm);
      let opt = n && n >= 1 && n <= state.options.length ? state.options[n - 1] : undefined;
      if (!opt) {
        const m = norm.match(/^(\d{1,2})(?:[:h](\d{2})?)?h?$/);
        if (m) {
          const hm = `${m[1].padStart(2, "0")}:${m[2] ?? "00"}`;
          opt = state.options.find((o) => formatTime(o.start, ctx.clinic.timezone) === hm);
        }
      }
      if (!opt) return ["Responda com o número do horário desejado." + BACK];
      set(ctx, {
        step: "confirm_booking",
        procedureId: state.procedureId,
        dentistId: opt.dentistId,
        start: opt.start,
        rescheduleId: state.rescheduleId,
      });
      const [proc, dentist] = await Promise.all([
        db.procedure.findUniqueOrThrow({ where: { id: state.procedureId } }),
        db.dentist.findUniqueOrThrow({ where: { id: opt.dentistId } }),
      ]);
      return [
        `${state.rescheduleId ? "Confirma a remarcação" : "Confirma o agendamento"}?\n\n` +
          `🦷 ${proc.name}\n👩‍⚕️ ${dentist.name}\n📅 ${formatDayTime(opt.start, ctx.clinic.timezone)}\n\n` +
          "*1* - Sim, confirmar\n*2* - Escolher outro horário\n*0* - Cancelar e voltar ao menu",
      ];
    }

    case "confirm_booking": {
      if (YES.test(norm)) return finishBooking(ctx, state);
      if (parseChoice(norm) === 2) return chooseDay(ctx, state.procedureId, null, undefined, state.rescheduleId);
      return ["Responda *1* para confirmar ou *2* para escolher outro horário." + BACK];
    }

    case "my_appointments": {
      const n = parseChoice(norm);
      if (!n || n < 1 || n > state.options.length) return ["Responda com o número da consulta." + BACK];
      return appointmentActions(ctx, state.options[n - 1]);
    }

    case "appointment_action": {
      const n = parseChoice(norm);
      if (n === 1) {
        const appt = await setAppointmentStatus(ctx.clinic.id, state.appointmentId, "CONFIRMED", ctx.patient.id);
        set(ctx, { step: "menu" });
        return [`Presença confirmada ✅ Te esperamos ${formatDayTime(appt.start, ctx.clinic.timezone)}!` + BACK];
      }
      if (n === 2) {
        const appt = await db.appointment.findFirst({ where: { id: state.appointmentId, patientId: ctx.patient.id } });
        if (!appt) return myAppointments(ctx);
        return chooseDentist(ctx, appt.procedureId, appt.id);
      }
      if (n === 3) {
        set(ctx, { step: "confirm_cancel", appointmentId: state.appointmentId });
        return ["Tem certeza que deseja *cancelar* essa consulta?\n\n*1* - Sim, cancelar\n*2* - Não, manter"];
      }
      return ["Responda *1* para confirmar, *2* para remarcar ou *3* para cancelar." + BACK];
    }

    case "confirm_cancel": {
      if (YES.test(norm)) {
        await setAppointmentStatus(ctx.clinic.id, state.appointmentId, "CANCELED", ctx.patient.id);
        set(ctx, { step: "menu" });
        return [
          "Consulta cancelada. Quando quiser remarcar é só responder *1* aqui que eu te mostro os horários 😉" + BACK,
        ];
      }
      set(ctx, { step: "menu" });
      return ["Tudo certo, sua consulta foi mantida. 👍" + BACK];
    }
  }
}

async function handleMenuChoice(ctx: BotContext, norm: string): Promise<string[]> {
  const n = parseChoice(norm);
  const pending = ctx.state;
  if (pending.step === "awaiting_confirmation" && n === 2) return appointmentActions(ctx, pending.appointmentId);
  if (n === 1 || RX.schedule.test(norm)) return startScheduling(ctx);
  if (n === 2 || RX.mine.test(norm)) return myAppointments(ctx);
  if (n === 3 || RX.info.test(norm)) return info(ctx);
  if (n === 4 || RX.human.test(norm)) return handoff(ctx);
  set(ctx, { step: "menu" });
  return [`Não entendi 😅\n\n${MENU_TEXT}`];
}

async function startScheduling(ctx: BotContext, rescheduleId?: string): Promise<string[]> {
  const procedures = await db.procedure.findMany({
    where: { clinicId: ctx.clinic.id, active: true, dentists: { some: { active: true } } },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  if (!procedures.length) return handoff(ctx, "No momento não há procedimentos disponíveis para agendamento online.");
  set(ctx, { step: "choose_procedure", options: procedures.map((p) => p.id), rescheduleId });
  const lines = procedures.map((p, i) => {
    const price = p.priceCents ? ` — ${formatMoney(p.priceCents)}` : "";
    return `*${i + 1}* - ${p.name}${price}`;
  });
  return [`Qual procedimento você deseja agendar?\n\n${lines.join("\n")}${BACK}`];
}

async function chooseDentist(ctx: BotContext, procedureId: string, rescheduleId?: string): Promise<string[]> {
  const dentists = await db.dentist.findMany({
    where: { clinicId: ctx.clinic.id, active: true, procedures: { some: { id: procedureId } } },
    orderBy: { name: "asc" },
  });
  if (dentists.length === 0) return handoff(ctx, "Não encontrei profissional disponível para esse procedimento.");
  if (dentists.length === 1) return chooseDay(ctx, procedureId, dentists[0].id, undefined, rescheduleId);
  const options: (string | null)[] = [...dentists.map((d) => d.id), null];
  set(ctx, { step: "choose_dentist", procedureId, options, rescheduleId });
  const lines = dentists.map((d, i) => `*${i + 1}* - ${d.name}${d.specialty ? ` (${d.specialty})` : ""}`);
  lines.push(`*${dentists.length + 1}* - Sem preferência (primeiro horário livre)`);
  return [`Tem preferência de profissional?\n\n${lines.join("\n")}${BACK}`];
}

async function chooseDay(
  ctx: BotContext,
  procedureId: string,
  dentistId: string | null,
  fromDay?: string,
  rescheduleId?: string,
): Promise<string[]> {
  const tz = ctx.clinic.timezone;
  let slots = await findAvailableSlots({
    clinicId: ctx.clinic.id,
    procedureId,
    dentistId,
    fromDay,
    days: SEARCH_WINDOW_DAYS,
    now: ctx.now,
    excludeAppointmentId: rescheduleId,
  });
  if (!dentistId) slots = dedupeByStart(slots);
  const byDay = [...groupByDay(slots, tz).keys()];
  if (!byDay.length) {
    set(ctx, { step: "menu" });
    return [
      "Poxa, não encontrei horários livres nas próximas semanas para essa opção 😕\n\n" +
        "Responda *4* para falar com nossa equipe e encontrarmos um encaixe, ou *1* para tentar outro procedimento.",
    ];
  }
  const shown = byDay.slice(0, MAX_DAYS_SHOWN);
  const lastShown = shown[shown.length - 1];
  const nextFrom = DateTime.fromISO(lastShown, { zone: tz }).plus({ days: 1 }).toISODate()!;
  set(ctx, { step: "choose_day", procedureId, dentistId, options: shown, nextFrom, rescheduleId });
  const lines = shown.map((d, i) => `*${i + 1}* - ${capitalize(formatDay(DateTime.fromISO(d, { zone: tz }).toJSDate(), tz))}`);
  lines.push(`*${shown.length + 1}* - Ver mais datas`);
  return [`Escolha o melhor dia:\n\n${lines.join("\n")}${BACK}`];
}

async function chooseTime(
  ctx: BotContext,
  procedureId: string,
  dentistId: string | null,
  day: string,
  rescheduleId?: string,
): Promise<string[]> {
  const tz = ctx.clinic.timezone;
  let slots = await findAvailableSlots({
    clinicId: ctx.clinic.id,
    procedureId,
    dentistId,
    fromDay: day,
    days: 1,
    now: ctx.now,
    excludeAppointmentId: rescheduleId,
  });
  if (!dentistId) slots = dedupeByStart(slots);
  if (!slots.length) return chooseDay(ctx, procedureId, dentistId, undefined, rescheduleId);
  const shown = spread(slots, MAX_TIMES_SHOWN);
  set(ctx, {
    step: "choose_time",
    procedureId,
    dentistId,
    day,
    options: shown.map((s) => ({ start: s.start.toISOString(), dentistId: s.dentistId })),
    rescheduleId,
  });
  const lines = shown.map((s, i) => `*${i + 1}* - ${formatTime(s.start, tz)}`);
  const dayLabel = formatDay(DateTime.fromISO(day, { zone: tz }).toJSDate(), tz);
  return [`Horários disponíveis na ${dayLabel}:\n\n${lines.join("\n")}${BACK}`];
}

/** Se houver muitos horários, distribui a amostra ao longo do dia (manhã e tarde). */
function spread<T>(items: T[], max: number): T[] {
  if (items.length <= max) return items;
  const out: T[] = [];
  for (let i = 0; i < max; i++) out.push(items[Math.round((i * (items.length - 1)) / (max - 1))]);
  return [...new Set(out)];
}

async function finishBooking(
  ctx: BotContext,
  state: Extract<BotState, { step: "confirm_booking" }>,
): Promise<string[]> {
  try {
    const appt = await bookAppointment({
      clinicId: ctx.clinic.id,
      patientId: ctx.patient.id,
      procedureId: state.procedureId,
      dentistId: state.dentistId,
      start: new Date(state.start),
      source: "BOT",
      replacesAppointmentId: state.rescheduleId,
      now: ctx.now,
    });
    set(ctx, { step: "menu" });
    const addr = ctx.clinic.address ? `\n📍 ${ctx.clinic.address}` : "";
    return [
      `${state.rescheduleId ? "Consulta remarcada" : "Pronto! Consulta agendada"} ✅\n\n` +
        `🦷 ${appt.procedure.name}\n👩‍⚕️ ${appt.dentist.name}\n📅 ${capitalize(formatDayTime(appt.start, ctx.clinic.timezone))}${addr}\n\n` +
        "Vou te enviar um lembrete um dia antes. Se precisar, é só mandar mensagem por aqui!" +
        BACK,
    ];
  } catch (e) {
    if (e instanceof SchedulingError) {
      const msgs = await chooseDay(ctx, state.procedureId, null, undefined, state.rescheduleId);
      return ["Ops! Esse horário acabou de ser ocupado 😕 Vamos escolher outro:", ...msgs];
    }
    throw e;
  }
}

async function myAppointments(ctx: BotContext): Promise<string[]> {
  const appts = await upcomingAppointments(ctx.clinic.id, ctx.patient.id, ctx.now);
  if (!appts.length) {
    set(ctx, { step: "menu" });
    return ["Você não tem consultas agendadas no momento.\n\n*1* - Agendar uma consulta" + BACK];
  }
  if (appts.length === 1) return appointmentActions(ctx, appts[0].id);
  set(ctx, { step: "my_appointments", options: appts.map((a) => a.id) });
  const lines = appts.map(
    (a, i) => `*${i + 1}* - ${capitalize(formatDayTime(a.start, ctx.clinic.timezone))} — ${a.procedure.name} (${a.dentist.name})`,
  );
  return [`Suas próximas consultas:\n\n${lines.join("\n")}\n\nQual delas você quer gerenciar?${BACK}`];
}

async function appointmentActions(ctx: BotContext, appointmentId: string): Promise<string[]> {
  const appt = await db.appointment.findFirst({
    where: { id: appointmentId, patientId: ctx.patient.id, status: { in: ["SCHEDULED", "CONFIRMED"] } },
    include: { procedure: true, dentist: true },
  });
  if (!appt) return myAppointments(ctx);
  set(ctx, { step: "appointment_action", appointmentId: appt.id });
  const status = appt.status === "CONFIRMED" ? "✅ Confirmada" : "⏳ Aguardando confirmação";
  return [
    `🦷 ${appt.procedure.name}\n👩‍⚕️ ${appt.dentist.name}\n📅 ${capitalize(formatDayTime(appt.start, ctx.clinic.timezone))}\n${status}\n\n` +
      "*1* - Confirmar presença\n*2* - Remarcar\n*3* - Cancelar" +
      BACK,
  ];
}

async function info(ctx: BotContext): Promise<string[]> {
  const hours = await clinicHoursSummary(ctx.clinic.id);
  const parts = [`*${ctx.clinic.name}*`];
  if (ctx.clinic.address) parts.push(`📍 ${ctx.clinic.address}`);
  if (ctx.clinic.phone) parts.push(`📞 ${ctx.clinic.phone}`);
  parts.push(`🕒 ${hours}`);
  if (ctx.clinic.infoText) parts.push(`\n${ctx.clinic.infoText}`);
  set(ctx, { step: "menu" });
  return [parts.join("\n") + BACK];
}

export async function handoff(ctx: BotContext, reason?: string): Promise<string[]> {
  ctx.handoff = true;
  set(ctx, { step: "idle" });
  return [
    `${reason ? reason + "\n\n" : ""}Certo! Vou chamar alguém da nossa equipe para continuar seu atendimento. ` +
      "Em instantes você será respondido(a) por aqui. 🙂",
  ];
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
