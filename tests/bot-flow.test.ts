import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { bookAppointment, SchedulingError } from "@/lib/scheduling";
import { runAutomationsForClinic } from "@/lib/automations/run";
import { runTool } from "@/lib/bot/tools";
import { readState } from "@/lib/bot/state";
import { handleInbound } from "@/lib/whatsapp/inbound";
import { chat, makeClinic, resetDb } from "./helpers";

const H = 3_600_000;

beforeEach(async () => {
  await resetDb();
});

async function nextFreeSlot(clinicId: string, procedureName: string) {
  const { findAvailableSlots } = await import("@/lib/scheduling");
  const proc = await db.procedure.findFirstOrThrow({ where: { clinicId, name: { contains: procedureName } } });
  const [slot] = await findAvailableSlots({ clinicId, procedureId: proc.id, days: 14 });
  return { proc, slot };
}

describe("robô de menu — fluxo completo", () => {
  it("cadastra nome, agenda, consulta e cancela", async () => {
    const clinic = await makeClinic();
    const send = chat(clinic.id, "5511988887777");

    expect(await send("Oi")).toContain("nome completo");
    const r1 = await send("maria da silva");
    expect(r1).toContain("Prazer, Maria");
    expect((await db.patient.findFirstOrThrow({ where: { clinicId: clinic.id } })).name).toBe("Maria da Silva");

    expect(await send("1")).toContain("Qual procedimento");
    const days = await send("2"); // Limpeza — só 1 dentista, pula escolha de profissional
    expect(days).toContain("Escolha o melhor dia");
    expect(await send("1")).toContain("Horários disponíveis");
    expect(await send("1")).toContain("Confirma o agendamento");
    const done = await send("1");
    expect(done).toContain("Consulta agendada");
    expect(done).toContain("Rua das Flores");

    const appt = await db.appointment.findFirstOrThrow({ where: { clinicId: clinic.id }, include: { procedure: true } });
    expect(appt.source).toBe("BOT");
    expect(appt.status).toBe("SCHEDULED");
    expect(appt.procedure.name).toContain("Limpeza");
    expect(appt.end.getTime() - appt.start.getTime()).toBe(60 * 60_000);

    // Minhas consultas → única consulta abre direto as ações
    expect(await send("0")).toContain("Agendar consulta");
    expect(await send("2")).toContain("Confirmar presença");
    expect(await send("3")).toContain("Tem certeza");
    expect(await send("sim")).toContain("Consulta cancelada");
    expect((await db.appointment.findUniqueOrThrow({ where: { id: appt.id } })).status).toBe("CANCELED");
  });

  it("remarca mantendo o procedimento e liberando o horário antigo", async () => {
    const clinic = await makeClinic();
    const send = chat(clinic.id, "5511977776666");
    await send("oi");
    await send("João Pedro");
    await send("1");
    await send("1"); // Avaliação
    await send("1");
    await send("1");
    await send("1");
    const original = await db.appointment.findFirstOrThrow({ where: { clinicId: clinic.id } });

    await send("menu");
    await send("2");
    expect(await send("2")).toContain("Escolha o melhor dia");
    await send("2"); // outro dia
    await send("1");
    expect(await send("1")).toContain("Consulta remarcada");

    const all = await db.appointment.findMany({ where: { clinicId: clinic.id }, orderBy: { createdAt: "asc" } });
    expect(all).toHaveLength(2);
    expect(all[0].status).toBe("CANCELED");
    expect(all[1].status).toBe("SCHEDULED");
    expect(all[1].procedureId).toBe(original.procedureId);
  });

  it("transfere para humano e silencia o robô", async () => {
    const clinic = await makeClinic();
    const send = chat(clinic.id, "5511966665555");
    await send("oi");
    await send("Carla Dias");
    expect(await send("4")).toContain("equipe");
    const conv = await db.conversation.findFirstOrThrow({ where: { clinicId: clinic.id } });
    expect(conv.status).toBe("HUMAN");
    expect(await send("alguém aí?")).toBe("");
    // Depois do tempo limite sem resposta da equipe, o robô volta
    expect(await send("oi?", new Date(Date.now() + 13 * H))).toContain("Como posso te ajudar");
  });

  it("ignora mensagens duplicadas do webhook", async () => {
    const clinic = await makeClinic();
    const a = await handleInbound({ clinic, channel: "SIMULATOR", from: "5511955554444", text: "oi", providerMessageId: "wamid.1" });
    const b = await handleInbound({ clinic, channel: "SIMULATOR", from: "5511955554444", text: "oi", providerMessageId: "wamid.1" });
    expect(a.duplicate).toBe(false);
    expect(b.duplicate).toBe(true);
    expect(await db.message.count({ where: { direction: "IN" } })).toBe(1);
  });

  it("reconhece o paciente mesmo sem o nono dígito", async () => {
    const clinic = await makeClinic();
    await chat(clinic.id, "5511984443333")("oi");
    await chat(clinic.id, "551184443333")("oi de novo");
    expect(await db.patient.count({ where: { clinicId: clinic.id } })).toBe(1);
  });
});

describe("automações", () => {
  async function setupAppointment(hoursAhead: number) {
    const clinic = await makeClinic();
    const send = chat(clinic.id, "5511933332222");
    await send("oi");
    await send("Paulo Lima");
    const patient = await db.patient.findFirstOrThrow({ where: { clinicId: clinic.id } });
    const proc = await db.procedure.findFirstOrThrow({ where: { clinicId: clinic.id, name: { contains: "Avalia" } } });
    const dentist = await db.dentist.findFirstOrThrow({ where: { clinicId: clinic.id } });
    const appt = await bookAppointment({
      clinicId: clinic.id,
      patientId: patient.id,
      procedureId: proc.id,
      dentistId: dentist.id,
      start: new Date(Date.now() + hoursAhead * H),
      source: "STAFF",
      allowOutsideHours: true,
    });
    await db.appointment.update({ where: { id: appt.id }, data: { createdAt: new Date(Date.now() - 72 * H) } });
    return { clinic, send, patient, appt };
  }

  it("lembrete de 24h pede confirmação e resposta 1 confirma", async () => {
    const { clinic, send, appt } = await setupAppointment(20);
    const report = await runAutomationsForClinic(clinic);
    expect(report.reminder24h).toBe(1);
    const last = await db.message.findFirstOrThrow({ where: { sender: "SYSTEM" }, orderBy: { createdAt: "desc" } });
    expect(last.body).toContain("Paulo");
    expect(last.body).toContain("*1* para CONFIRMAR");

    // idempotente
    expect((await runAutomationsForClinic(clinic)).reminder24h).toBe(0);

    expect(await send("1")).toContain("Consulta confirmada");
    expect((await db.appointment.findUniqueOrThrow({ where: { id: appt.id } })).status).toBe("CONFIRMED");
  });

  it("resposta 2 ao lembrete abre opções de remarcar/cancelar", async () => {
    const { clinic, send } = await setupAppointment(20);
    await runAutomationsForClinic(clinic);
    expect(await send("2")).toContain("*2* - Remarcar");
  });

  it("respeita opt-out (SAIR)", async () => {
    const { clinic, send } = await setupAppointment(20);
    expect(await send("SAIR")).toContain("não receberá mais");
    expect((await runAutomationsForClinic(clinic)).reminder24h).toBe(0);
  });

  it("pós-consulta pede nota e nota baixa transfere para a equipe", async () => {
    const { clinic, send, appt } = await setupAppointment(-5);
    await db.appointment.update({ where: { id: appt.id }, data: { status: "COMPLETED" } });
    expect((await runAutomationsForClinic(clinic)).followup).toBe(1);
    const conv = await db.conversation.findFirstOrThrow({ where: { clinicId: clinic.id } });
    expect(readState(conv.botState).step).toBe("awaiting_rating");
    expect(await send("2")).toContain("Sentimos muito");
    expect((await db.appointment.findUniqueOrThrow({ where: { id: appt.id } })).rating).toBe(2);
    expect((await db.conversation.findUniqueOrThrow({ where: { id: conv.id } })).status).toBe("HUMAN");
  });
});

describe("agenda", () => {
  it("impede agendamento duplo no mesmo horário", async () => {
    const clinic = await makeClinic();
    const { proc, slot } = await nextFreeSlot(clinic.id, "Avalia");
    const [p1, p2] = await Promise.all([
      db.patient.create({ data: { clinicId: clinic.id, phone: "5511900000001", name: "A" } }),
      db.patient.create({ data: { clinicId: clinic.id, phone: "5511900000002", name: "B" } }),
    ]);
    const results = await Promise.allSettled(
      [p1, p2].map((p) =>
        bookAppointment({ clinicId: clinic.id, patientId: p.id, procedureId: proc.id, dentistId: slot.dentistId, start: slot.start, source: "BOT" }),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(SchedulingError);
  });

  it("robôs não agendam fora do expediente", async () => {
    const clinic = await makeClinic();
    const { proc, slot } = await nextFreeSlot(clinic.id, "Avalia");
    const p = await db.patient.create({ data: { clinicId: clinic.id, phone: "5511900000003", name: "C" } });
    const sunday3am = new Date("2026-11-22T06:00:00Z");
    await expect(
      bookAppointment({ clinicId: clinic.id, patientId: p.id, procedureId: proc.id, dentistId: slot.dentistId, start: sunday3am, source: "AI" }),
    ).rejects.toThrow("indisponível");
  });

  it("ferramentas da IA só enxergam consultas do próprio paciente", async () => {
    const clinic = await makeClinic();
    const { proc, slot } = await nextFreeSlot(clinic.id, "Avalia");
    const victim = await db.patient.create({ data: { clinicId: clinic.id, phone: "5511900000004", name: "Vítima" } });
    const attacker = await db.patient.create({ data: { clinicId: clinic.id, phone: "5511900000005", name: "Outro" } });
    const appt = await bookAppointment({
      clinicId: clinic.id, patientId: victim.id, procedureId: proc.id, dentistId: slot.dentistId, start: slot.start, source: "STAFF",
    });
    const conversation = await db.conversation.create({ data: { clinicId: clinic.id, patientId: attacker.id } });
    const ctx = { clinic, conversation, patient: attacker, state: { step: "idle" as const }, now: new Date() };

    const res = (await runTool(ctx, "cancelar_consulta", { consulta_id: appt.id })) as { erro?: string };
    expect(res.erro).toBeTruthy();
    expect((await db.appointment.findUniqueOrThrow({ where: { id: appt.id } })).status).toBe("SCHEDULED");
    const list = (await runTool(ctx, "listar_consultas", {})) as { consultas: unknown[] };
    expect(list.consultas).toHaveLength(0);

    const bad = (await runTool(ctx, "agendar_consulta", { procedimento_id: proc.id })) as { erro?: string };
    expect(bad.erro).toBe("Parâmetros inválidos");
  });

  it("ferramenta buscar_horarios retorna horários no fuso da clínica", async () => {
    const clinic = await makeClinic();
    const proc = await db.procedure.findFirstOrThrow({ where: { clinicId: clinic.id } });
    const patient = await db.patient.create({ data: { clinicId: clinic.id, phone: "5511900000006", name: "D" } });
    const conversation = await db.conversation.create({ data: { clinicId: clinic.id, patientId: patient.id } });
    const ctx = { clinic, conversation, patient, state: { step: "idle" as const }, now: new Date() };
    const res = (await runTool(ctx, "buscar_horarios", { procedimento_id: proc.id, dentista_id: null, a_partir_de: null, dias: 7 })) as {
      dias: { data: string; horarios: { inicio: string }[] }[];
    };
    expect(res.dias.length).toBeGreaterThan(0);
    expect(res.dias[0].horarios[0].inicio).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);

    const first = res.dias[0].horarios[0] as { inicio: string; dentista_id: string };
    const booked = (await runTool(ctx, "agendar_consulta", {
      procedimento_id: proc.id, dentista_id: first.dentista_id, inicio: first.inicio, observacoes: null,
    })) as { ok?: boolean; consulta?: { inicio: string } };
    expect(booked.ok).toBe(true);
    expect(booked.consulta?.inicio).toBe(first.inicio);
  });
});
