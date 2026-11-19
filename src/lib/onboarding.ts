import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { DateTime } from "luxon";
import { db } from "./db";
import { slugify } from "./format";
import { DEFAULT_AUTOMATIONS } from "./automations/settings";

export const DEFAULT_PROCEDURES = [
  { name: "Avaliação / consulta inicial", durationMin: 30, priceCents: null, description: "Primeira consulta, exame clínico e plano de tratamento" },
  { name: "Limpeza (profilaxia)", durationMin: 60, priceCents: null, description: "Remoção de tártaro e placa, polimento" },
  { name: "Restauração", durationMin: 60, priceCents: null, description: "Tratamento de cárie com resina" },
  { name: "Clareamento dental", durationMin: 60, priceCents: null, description: "Sessão de clareamento em consultório" },
  { name: "Tratamento de canal", durationMin: 90, priceCents: null, description: "Endodontia" },
  { name: "Extração", durationMin: 60, priceCents: null, description: "Exodontia simples" },
  { name: "Manutenção ortodôntica", durationMin: 30, priceCents: null, description: "Manutenção de aparelho" },
  { name: "Urgência (dor)", durationMin: 30, priceCents: null, description: "Atendimento de dor ou urgência" },
];

/** Segunda a sexta 08–12 e 13:30–18, sábado 08–12. */
export const DEFAULT_HOURS = [
  ...[1, 2, 3, 4, 5].flatMap((weekday) => [
    { weekday, start: "08:00", end: "12:00" },
    { weekday, start: "13:30", end: "18:00" },
  ]),
  { weekday: 6, start: "08:00", end: "12:00" },
];

async function uniqueSlug(base: string) {
  const root = slugify(base) || "clinica";
  for (let i = 0; ; i++) {
    const slug = i === 0 ? root : `${root}-${i + 1}`;
    if (!(await db.clinic.findUnique({ where: { slug } }))) return slug;
  }
}

export async function createClinicWithOwner(input: {
  clinicName: string;
  ownerName: string;
  email: string;
  password: string;
  phone?: string;
  trialDays?: number;
  acceptedTermsAt?: Date;
}) {
  const passwordHash = await bcrypt.hash(input.password, 10);
  const slug = await uniqueSlug(input.clinicName);
  return db.$transaction(async (tx) => {
    const clinic = await tx.clinic.create({
      data: {
        name: input.clinicName,
        slug,
        phone: input.phone || null,
        trialEndsAt: DateTime.now().plus({ days: input.trialDays ?? 14 }).toJSDate(),
        webhookSecret: crypto.randomBytes(24).toString("base64url"),
        automations: DEFAULT_AUTOMATIONS as object,
        infoText:
          "Formas de pagamento: Pix, cartão de crédito e débito.\nConvênios: consulte nossa equipe.",
      },
    });
    const user = await tx.user.create({
      data: {
        clinicId: clinic.id,
        name: input.ownerName,
        email: input.email.toLowerCase().trim(),
        passwordHash,
        role: "OWNER",
        termsAcceptedAt: input.acceptedTermsAt ?? null,
      },
    });
    const procedures = [];
    for (const [i, p] of DEFAULT_PROCEDURES.entries()) {
      procedures.push(await tx.procedure.create({ data: { ...p, clinicId: clinic.id, sortOrder: i } }));
    }
    await tx.dentist.create({
      data: {
        clinicId: clinic.id,
        name: input.ownerName.match(/^dr/i) ? input.ownerName : `Dr(a). ${input.ownerName}`,
        specialty: "Clínico geral",
        workingHours: { create: DEFAULT_HOURS },
        procedures: { connect: procedures.map((p) => ({ id: p.id })) },
      },
    });
    return { clinic, user };
  });
}
