import { db } from "@/lib/db";
import { createClinicWithOwner } from "@/lib/onboarding";
import { handleInbound } from "@/lib/whatsapp/inbound";

export async function resetDb() {
  const tables = ["Message", "Conversation", "Appointment", "TimeOff", "WorkingHour", "Patient", "User", "Dentist", "Procedure", "Clinic"];
  await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t}"`).join(", ")} CASCADE`);
}

export async function makeClinic(email = `dono${Date.now()}${Math.random()}@teste.com`) {
  const { clinic } = await createClinicWithOwner({
    clinicName: "Clínica Teste",
    ownerName: "Ana Souza",
    email,
    password: "segredo123",
  });
  return db.clinic.update({ where: { id: clinic.id }, data: { address: "Rua das Flores, 100" } });
}

export function chat(clinicId: string, from: string) {
  return async (text: string, now?: Date) => {
    const clinic = await db.clinic.findUniqueOrThrow({ where: { id: clinicId } });
    const res = await handleInbound({ clinic, channel: "SIMULATOR", from, text, now });
    return res.replies.join("\n---\n");
  };
}
