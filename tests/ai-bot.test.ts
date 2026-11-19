import { beforeEach, describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import { __setAnthropicClient } from "@/lib/bot/ai";
import { findAvailableSlots } from "@/lib/scheduling";
import { DateTime } from "luxon";
import { chat, makeClinic, resetDb } from "./helpers";

type Params = Anthropic.Beta.MessageCreateParamsNonStreaming;

/** Cliente falso: devolve respostas roteirizadas e grava as requisições. */
function fakeClient(script: ((p: Params) => Partial<Anthropic.Beta.BetaMessage>)[]) {
  const calls: Params[] = [];
  const client = {
    beta: {
      messages: {
        create: async (p: Params) => {
          calls.push(structuredClone(p));
          const step = script.shift();
          if (!step) throw new Error("roteiro acabou");
          return { id: "msg", type: "message", role: "assistant", model: p.model, stop_reason: "end_turn", content: [], ...step(p) };
        },
      },
    },
  } as unknown as Anthropic;
  return { client, calls };
}

beforeEach(async () => {
  await resetDb();
  process.env.ANTHROPIC_API_KEY = "test-key";
});

describe("assistente de IA (cliente falso)", () => {
  it("usa ferramentas para buscar horário e agendar", async () => {
    const clinic = await makeClinic();
    await db.clinic.update({ where: { id: clinic.id }, data: { botMode: "AI" } });
    const proc = await db.procedure.findFirstOrThrow({ where: { clinicId: clinic.id, name: { contains: "Limpeza" } } });
    const [slot] = await findAvailableSlots({ clinicId: clinic.id, procedureId: proc.id, days: 14 });
    const local = DateTime.fromJSDate(slot.start).setZone(clinic.timezone).toFormat("yyyy-MM-dd'T'HH:mm");

    let toolResult = "";
    const { client, calls } = fakeClient([
      () => ({
        stop_reason: "tool_use",
        content: [
          { type: "tool_use", id: "t1", name: "salvar_nome_paciente", input: { nome: "Helena Prado" } } as Anthropic.Beta.BetaToolUseBlock,
          { type: "tool_use", id: "t2", name: "agendar_consulta", input: { procedimento_id: proc.id, dentista_id: slot.dentistId, inicio: local, observacoes: null } } as Anthropic.Beta.BetaToolUseBlock,
        ],
      }),
      (p) => {
        const last = p.messages[p.messages.length - 1];
        toolResult = JSON.stringify(last.content);
        return { content: [{ type: "text", text: "Prontinho, Helena! Sua limpeza está agendada ✅" } as Anthropic.Beta.BetaTextBlock] };
      },
    ]);
    __setAnthropicClient(client);

    const reply = await chat(clinic.id, "5511912340000")("Oi, sou a Helena Prado, quero agendar uma limpeza nesse horário");
    expect(reply).toContain("Prontinho");

    // Requisição: modelo, ferramentas estritas, fallback e cache no prompt fixo
    const first = calls[0];
    expect(first.model).toBe("claude-opus-5-5");
    expect(first.betas).toContain("server-side-fallback-2026-07-01");
    expect(first.fallbacks).toBe("default");
    expect(first.tools?.every((t) => (t as Anthropic.Beta.BetaTool).strict === true)).toBe(true);
    const system = first.system as Anthropic.Beta.BetaTextBlockParam[];
    expect(system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(system[0].text).toContain(proc.id);
    expect(system[1].text).toContain("Agora:");
    expect(first.messages.at(-1)?.role).toBe("user");

    // Segunda chamada recebeu os tool_results na mesma mensagem
    expect(calls[1].messages.at(-2)?.role).toBe("assistant");
    expect(toolResult).toContain('"tool_use_id":"t1"');
    expect(toolResult).toContain('"tool_use_id":"t2"');
    expect(toolResult).toContain('\\"ok\\":true');

    const appt = await db.appointment.findFirstOrThrow({ where: { clinicId: clinic.id }, include: { patient: true } });
    expect(appt.source).toBe("AI");
    expect(appt.patient.name).toBe("Helena Prado");
    expect(appt.start.getTime()).toBe(slot.start.getTime());
  });

  it("recusa do modelo transfere para a equipe", async () => {
    const clinic = await makeClinic();
    await db.clinic.update({ where: { id: clinic.id }, data: { botMode: "AI" } });
    const { client } = fakeClient([() => ({ stop_reason: "refusal", content: [] })]);
    __setAnthropicClient(client);
    const reply = await chat(clinic.id, "5511912340001")("mensagem qualquer");
    expect(reply).toContain("equipe");
    expect((await db.conversation.findFirstOrThrow({ where: { clinicId: clinic.id } })).status).toBe("HUMAN");
  });

  it("erro na API cai para o robô de menu", async () => {
    const clinic = await makeClinic();
    await db.clinic.update({ where: { id: clinic.id }, data: { botMode: "AI" } });
    __setAnthropicClient(fakeClient([]).client);
    const reply = await chat(clinic.id, "5511912340002")("oi");
    expect(reply).toContain("nome completo");
  });
});
