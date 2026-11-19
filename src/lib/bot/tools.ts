import { DateTime } from "luxon";
import { z } from "zod";
import { db } from "../db";
import {
  bookAppointment,
  dedupeByStart,
  findAvailableSlots,
  groupByDay,
  SchedulingError,
  setAppointmentStatus,
  upcomingAppointments,
} from "../scheduling";
import { weekdayName } from "../tz";
import type { BotContext } from "./context";

/**
 * Ferramentas da assistente de IA. Todas são escopadas ao paciente da conversa:
 * a IA nunca consegue ver ou alterar consultas de outra pessoa.
 * Datas trafegam no fuso da clínica, no formato "AAAA-MM-DDTHH:mm".
 */

const LOCAL_DT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

export const toolSchemas = {
  buscar_horarios: z.object({
    procedimento_id: z.string(),
    dentista_id: z.string().nullable(),
    a_partir_de: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    dias: z.number().int().min(1).max(31).nullable(),
  }),
  agendar_consulta: z.object({
    procedimento_id: z.string(),
    dentista_id: z.string(),
    inicio: z.string().regex(LOCAL_DT),
    observacoes: z.string().nullable(),
  }),
  listar_consultas: z.object({}),
  confirmar_presenca: z.object({ consulta_id: z.string() }),
  cancelar_consulta: z.object({ consulta_id: z.string() }),
  remarcar_consulta: z.object({ consulta_id: z.string(), dentista_id: z.string(), inicio: z.string().regex(LOCAL_DT) }),
  salvar_nome_paciente: z.object({ nome: z.string().min(2).max(80) }),
  transferir_para_humano: z.object({ motivo: z.string() }),
} as const;

export type ToolName = keyof typeof toolSchemas;

function toLocal(d: Date, tz: string) {
  return DateTime.fromJSDate(d).setZone(tz).toFormat("yyyy-MM-dd'T'HH:mm");
}
function fromLocal(s: string, tz: string) {
  const dt = DateTime.fromISO(s, { zone: tz });
  if (!dt.isValid) throw new SchedulingError("INVALID", "Data/hora inválida");
  return dt.toJSDate();
}

function describeAppointment(a: Awaited<ReturnType<typeof upcomingAppointments>>[number], tz: string) {
  const dt = DateTime.fromJSDate(a.start).setZone(tz);
  return {
    consulta_id: a.id,
    procedimento: a.procedure.name,
    dentista: a.dentist.name,
    dentista_id: a.dentist.id,
    procedimento_id: a.procedure.id,
    inicio: toLocal(a.start, tz),
    dia_semana: weekdayName(dt),
    status: a.status === "CONFIRMED" ? "confirmada" : "aguardando confirmação",
  };
}

export async function runTool(ctx: BotContext, name: string, rawInput: unknown): Promise<unknown> {
  const tz = ctx.clinic.timezone;
  if (!(name in toolSchemas)) return { erro: `Ferramenta desconhecida: ${name}` };
  const parsed = toolSchemas[name as ToolName].safeParse(rawInput);
  if (!parsed.success) return { erro: "Parâmetros inválidos", detalhes: parsed.error.issues.map((i) => i.message) };
  const input = parsed.data as Record<string, unknown>;

  try {
    switch (name as ToolName) {
      case "buscar_horarios": {
        const i = input as z.infer<typeof toolSchemas.buscar_horarios>;
        let slots = await findAvailableSlots({
          clinicId: ctx.clinic.id,
          procedureId: i.procedimento_id,
          dentistId: i.dentista_id,
          fromDay: i.a_partir_de ?? undefined,
          days: i.dias ?? 7,
          now: ctx.now,
        });
        if (!i.dentista_id) slots = dedupeByStart(slots);
        const dentists = new Map(
          (await db.dentist.findMany({ where: { clinicId: ctx.clinic.id } })).map((d) => [d.id, d.name]),
        );
        const days = [...groupByDay(slots, tz).entries()].slice(0, 7).map(([day, list]) => ({
          data: day,
          dia_semana: weekdayName(DateTime.fromISO(day, { zone: tz })),
          horarios: list.slice(0, 16).map((s) => ({
            inicio: toLocal(s.start, tz),
            dentista_id: s.dentistId,
            dentista: dentists.get(s.dentistId),
          })),
        }));
        return days.length ? { dias: days } : { dias: [], aviso: "Nenhum horário livre nesse período." };
      }

      case "agendar_consulta": {
        const i = input as z.infer<typeof toolSchemas.agendar_consulta>;
        if (!ctx.patient.name) return { erro: "Antes de agendar, pergunte e salve o nome completo do paciente." };
        const appt = await bookAppointment({
          clinicId: ctx.clinic.id,
          patientId: ctx.patient.id,
          procedureId: i.procedimento_id,
          dentistId: i.dentista_id,
          start: fromLocal(i.inicio, tz),
          source: "AI",
          notes: i.observacoes,
          now: ctx.now,
        });
        return { ok: true, consulta: describeAppointment(appt, tz) };
      }

      case "listar_consultas": {
        const appts = await upcomingAppointments(ctx.clinic.id, ctx.patient.id, ctx.now);
        return { consultas: appts.map((a) => describeAppointment(a, tz)) };
      }

      case "confirmar_presenca": {
        const i = input as z.infer<typeof toolSchemas.confirmar_presenca>;
        const a = await setAppointmentStatus(ctx.clinic.id, i.consulta_id, "CONFIRMED", ctx.patient.id);
        return { ok: true, consulta: describeAppointment(a, tz) };
      }

      case "cancelar_consulta": {
        const i = input as z.infer<typeof toolSchemas.cancelar_consulta>;
        await setAppointmentStatus(ctx.clinic.id, i.consulta_id, "CANCELED", ctx.patient.id);
        return { ok: true };
      }

      case "remarcar_consulta": {
        const i = input as z.infer<typeof toolSchemas.remarcar_consulta>;
        const old = await db.appointment.findFirst({
          where: { id: i.consulta_id, clinicId: ctx.clinic.id, patientId: ctx.patient.id, status: { in: ["SCHEDULED", "CONFIRMED"] } },
        });
        if (!old) return { erro: "Consulta não encontrada para este paciente." };
        const appt = await bookAppointment({
          clinicId: ctx.clinic.id,
          patientId: ctx.patient.id,
          procedureId: old.procedureId,
          dentistId: i.dentista_id,
          start: fromLocal(i.inicio, tz),
          source: "AI",
          replacesAppointmentId: old.id,
          now: ctx.now,
        });
        return { ok: true, nova_consulta: describeAppointment(appt, tz) };
      }

      case "salvar_nome_paciente": {
        const i = input as z.infer<typeof toolSchemas.salvar_nome_paciente>;
        ctx.patient = await db.patient.update({ where: { id: ctx.patient.id }, data: { name: i.nome.trim() } });
        return { ok: true };
      }

      case "transferir_para_humano": {
        ctx.handoff = true;
        return { ok: true, instrucao: "Avise o paciente que a equipe vai responder em breve." };
      }
    }
  } catch (e) {
    if (e instanceof SchedulingError) return { erro: e.message, codigo: e.code };
    throw e;
  }
  return { erro: "não implementado" };
}

/** Definições JSON Schema enviadas à API (strict: entradas sempre válidas no schema). */
export const toolDefinitions = [
  {
    name: "buscar_horarios",
    description:
      "Busca horários livres reais na agenda para um procedimento. Use SEMPRE antes de oferecer horários — nunca invente. " +
      "Retorna até 7 dias com horários. dentista_id null = qualquer profissional que faça o procedimento.",
    input_schema: {
      type: "object" as const,
      properties: {
        procedimento_id: { type: "string", description: "ID do procedimento (da lista no contexto)" },
        dentista_id: { type: ["string", "null"], description: "ID do profissional, ou null para sem preferência" },
        a_partir_de: { type: ["string", "null"], description: "Data inicial AAAA-MM-DD no fuso da clínica, ou null para hoje" },
        dias: { type: ["integer", "null"], description: "Quantos dias consultar (1 a 31). null = 7" },
      },
      required: ["procedimento_id", "dentista_id", "a_partir_de", "dias"],
      additionalProperties: false,
    },
  },
  {
    name: "agendar_consulta",
    description:
      "Agenda uma consulta para o paciente desta conversa. Só chame depois que o paciente confirmar explicitamente " +
      "procedimento, profissional, dia e horário. O horário precisa ter vindo de buscar_horarios.",
    input_schema: {
      type: "object" as const,
      properties: {
        procedimento_id: { type: "string" },
        dentista_id: { type: "string" },
        inicio: { type: "string", description: "AAAA-MM-DDTHH:mm no fuso da clínica (ex.: 2026-11-18T14:30)" },
        observacoes: { type: ["string", "null"], description: "Queixa ou observação curta do paciente, se houver" },
      },
      required: ["procedimento_id", "dentista_id", "inicio", "observacoes"],
      additionalProperties: false,
    },
  },
  {
    name: "listar_consultas",
    description: "Lista as próximas consultas do paciente desta conversa (com consulta_id).",
    input_schema: { type: "object" as const, properties: {}, required: [], additionalProperties: false },
  },
  {
    name: "confirmar_presenca",
    description: "Confirma a presença do paciente em uma consulta dele.",
    input_schema: {
      type: "object" as const,
      properties: { consulta_id: { type: "string" } },
      required: ["consulta_id"],
      additionalProperties: false,
    },
  },
  {
    name: "cancelar_consulta",
    description: "Cancela uma consulta do paciente. Peça confirmação explícita antes de chamar.",
    input_schema: {
      type: "object" as const,
      properties: { consulta_id: { type: "string" } },
      required: ["consulta_id"],
      additionalProperties: false,
    },
  },
  {
    name: "remarcar_consulta",
    description:
      "Remarca uma consulta existente para um novo horário (mesmo procedimento). O novo horário deve vir de buscar_horarios " +
      "e o paciente deve ter confirmado.",
    input_schema: {
      type: "object" as const,
      properties: {
        consulta_id: { type: "string" },
        dentista_id: { type: "string" },
        inicio: { type: "string", description: "AAAA-MM-DDTHH:mm no fuso da clínica" },
      },
      required: ["consulta_id", "dentista_id", "inicio"],
      additionalProperties: false,
    },
  },
  {
    name: "salvar_nome_paciente",
    description: "Salva o nome completo informado pelo paciente.",
    input_schema: {
      type: "object" as const,
      properties: { nome: { type: "string" } },
      required: ["nome"],
      additionalProperties: false,
    },
  },
  {
    name: "transferir_para_humano",
    description:
      "Transfere a conversa para a equipe da clínica. Use quando o paciente pedir, em emergências, reclamações, " +
      "dúvidas clínicas, orçamentos detalhados, convênios específicos ou qualquer coisa que você não consiga resolver.",
    input_schema: {
      type: "object" as const,
      properties: { motivo: { type: "string", description: "Resumo curto para a equipe" } },
      required: ["motivo"],
      additionalProperties: false,
    },
  },
];
