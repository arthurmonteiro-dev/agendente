/**
 * Dados de demonstração: `npm run db:seed`
 * Login: demo@agendente.com.br / demo12345
 */
import { DateTime } from "luxon";
import { db } from "../src/lib/db";
import { createClinicWithOwner } from "../src/lib/onboarding";
import { bookAppointment } from "../src/lib/scheduling";
import { handleInbound } from "../src/lib/whatsapp/inbound";
import { sendToPatient } from "../src/lib/whatsapp/outbound";

const EMAIL = "demo@agendente.com.br";
const TZ = "America/Sao_Paulo";

const PATIENTS = [
  ["Juliana Martins", "5511991230001"], ["Carlos Eduardo Pereira", "5511991230002"], ["Fernanda Oliveira", "5511991230003"],
  ["Rafael Santos", "5511991230004"], ["Beatriz Costa", "5511991230005"], ["Lucas Almeida", "5511991230006"],
  ["Mariana Ribeiro", "5511991230007"], ["Gabriel Ferreira", "5511991230008"], ["Patrícia Gomes", "5511991230009"],
  ["Thiago Carvalho", "5511991230010"], ["Camila Rocha", "5511991230011"], ["André Barbosa", "5511991230012"],
  ["Larissa Mendes", "5511991230013"], ["Pedro Henrique Dias", "5511991230014"], ["Aline Cardoso", "5511991230015"],
];

async function main() {
  const old = await db.user.findUnique({ where: { email: EMAIL } });
  if (old) await db.clinic.delete({ where: { id: old.clinicId } });

  const { clinic } = await createClinicWithOwner({
    clinicName: "Clínica Sorriso",
    ownerName: "Ana Souza",
    email: EMAIL,
    password: "demo12345",
    phone: "(11) 3333-4444",
    trialDays: 14,
  });
  await db.clinic.update({
    where: { id: clinic.id },
    data: {
      address: "Av. Paulista, 1000, sala 12 — Bela Vista, São Paulo/SP",
      infoText: "Pagamento: Pix, cartão de crédito (até 10x) e débito.\nConvênios: Amil Dental e OdontoPrev.\nEstacionamento conveniado no prédio.",
    },
  });

  const procs = await db.procedure.findMany({ where: { clinicId: clinic.id } });
  const byName = (s: string) => procs.find((p) => p.name.toLowerCase().includes(s.toLowerCase()))!;
  const prices: Record<string, number> = { "Avaliação": 0, "Limpeza": 25000, "Clareamento": 90000, "Restauração": 30000 };
  for (const [k, v] of Object.entries(prices)) {
    await db.procedure.update({ where: { id: byName(k).id }, data: { priceCents: v || null } });
  }

  const ana = await db.dentist.findFirstOrThrow({ where: { clinicId: clinic.id } });
  await db.dentist.update({
    where: { id: ana.id },
    data: { name: "Dra. Ana Souza", cro: "CRO-SP 12345", procedures: { disconnect: { id: byName("Manutenção").id } } },
  });
  const bruno = await db.dentist.create({
    data: {
      clinicId: clinic.id,
      name: "Dr. Bruno Lima",
      specialty: "Ortodontia",
      cro: "CRO-SP 67890",
      color: "#6366f1",
      workingHours: {
        create: [2, 4].flatMap((weekday) => [
          { weekday, start: "09:00", end: "12:00" },
          { weekday, start: "14:00", end: "19:00" },
        ]).concat([{ weekday: 6, start: "08:00", end: "12:00" }]),
      },
      procedures: { connect: ["Avaliação", "Manutenção", "Clareamento"].map((n) => ({ id: byName(n).id })) },
    },
  });

  const patients = [];
  for (const [i, [name, phone]] of PATIENTS.entries()) {
    patients.push(
      await db.patient.create({
        data: { clinicId: clinic.id, name, phone, birthDate: new Date(Date.UTC(1975 + i * 2, i % 12, 3 + i)) },
      }),
    );
  }

  // Agenda: semana passada, esta semana e a próxima
  const monday = DateTime.now().setZone(TZ).startOf("week");
  const plan: [number, string, string, number, string][] = [
    // [dia relativo à segunda desta semana, hora, procedimento, paciente, dentista]
    [-7, "09:00", "Limpeza", 10, "ana"], [-6, "14:00", "Avaliação", 11, "ana"], [-5, "10:00", "Restauração", 12, "ana"],
    [-5, "15:00", "Manutenção", 13, "bruno"], [-3, "11:00", "Canal", 14, "ana"],
    [0, "08:00", "Avaliação", 0, "ana"], [0, "09:00", "Limpeza", 1, "ana"], [0, "14:00", "Restauração", 2, "ana"],
    [1, "09:00", "Manutenção", 3, "bruno"], [1, "10:00", "Limpeza", 4, "ana"], [1, "15:00", "Clareamento", 5, "bruno"],
    [2, "08:30", "Avaliação", 6, "ana"], [2, "13:30", "Canal", 7, "ana"],
    [3, "09:00", "Manutenção", 8, "bruno"], [3, "10:30", "Avaliação", 9, "ana"],
    [5, "08:00", "Limpeza", 10, "ana"], [5, "09:00", "Manutenção", 11, "bruno"],
    [7, "09:00", "Limpeza", 12, "ana"], [8, "16:00", "Clareamento", 13, "bruno"], [9, "14:00", "Restauração", 14, "ana"],
  ];
  const now = new Date();
  for (const [day, time, proc, pi, who] of plan) {
    const start = DateTime.fromISO(`${monday.plus({ days: day }).toISODate()}T${time}`, { zone: TZ }).toJSDate();
    const appt = await bookAppointment({
      clinicId: clinic.id,
      patientId: patients[pi].id,
      procedureId: byName(proc).id,
      dentistId: who === "ana" ? ana.id : bruno.id,
      start,
      source: pi % 3 === 0 ? "STAFF" : pi % 3 === 1 ? "BOT" : "AI",
      allowOutsideHours: true,
    }).catch(() => null);
    if (!appt) continue;
    const past = appt.end < now;
    const status = past ? (pi === 12 ? "NO_SHOW" : "COMPLETED") : pi % 2 === 0 ? "CONFIRMED" : "SCHEDULED";
    await db.appointment.update({
      where: { id: appt.id },
      data: {
        status,
        rating: past && status === "COMPLETED" ? [5, 5, 4, 5, 3][pi % 5] : null,
        createdAt: new Date(start.getTime() - 5 * 86_400_000),
      },
    });
  }

  // Feriado nacional (Dia da Consciência Negra)
  const year = DateTime.now().setZone(TZ).year;
  await db.timeOff.create({
    data: {
      clinicId: clinic.id,
      start: DateTime.fromISO(`${year}-11-20T00:00`, { zone: TZ }).toJSDate(),
      end: DateTime.fromISO(`${year}-11-21T00:00`, { zone: TZ }).toJSDate(),
      reason: "Feriado — Consciência Negra",
    },
  });

  // Conversas de exemplo (canal simulador)
  const fresh = await db.clinic.findUniqueOrThrow({ where: { id: clinic.id } });
  const say = (from: string, text: string) => handleInbound({ clinic: fresh, channel: "SIMULATOR", from, text });
  for (const t of ["Oi, boa tarde!", "Renata Alves", "3"]) await say("5511998760001", t);
  for (const t of ["Olá", "Marcos Vinícius", "4", "Estou com o dente inchado desde ontem, vocês atendem hoje?"]) await say("5511998760002", t);
  for (const t of ["oi", "Sofia Nunes", "1", "1"]) await say("5511998760003", t);

  const marcos = await db.conversation.findFirstOrThrow({
    where: { clinicId: clinic.id, patient: { phone: "5511998760002" } },
    include: { patient: true },
  });
  await db.conversation.update({ where: { id: marcos.id }, data: { unread: 2 } });
  void sendToPatient; // equipe ainda não respondeu: aparece como "aguardando equipe"

  console.log(`✔ Demo criada: ${EMAIL} / demo12345 (clínica ${clinic.slug})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
