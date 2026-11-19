"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { normalizePhone } from "@/lib/phone";
import type { ActionResult } from "@/components/ActionForm";

function readPatient(fd: FormData) {
  const birth = String(fd.get("birthDate") || "");
  return {
    name: String(fd.get("name") || "").trim() || null,
    phone: normalizePhone(String(fd.get("phone") || "")),
    email: String(fd.get("email") || "").trim() || null,
    birthDate: birth ? new Date(`${birth}T12:00:00Z`) : null,
    notes: String(fd.get("notes") || "").trim() || null,
    optOut: fd.get("optOut") === "on",
  };
}

export async function createPatient(_p: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const data = readPatient(fd);
  if (!data.name) return { error: "Informe o nome." };
  if (data.phone.length < 12) return { error: "Telefone inválido (inclua o DDD)." };
  try {
    const p = await db.patient.create({ data: { ...data, clinicId: user.clinicId } });
    revalidatePath("/painel/pacientes");
    redirect(`/painel/pacientes/${p.id}`);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { error: "Já existe paciente com esse telefone." };
    throw e;
  }
}

export async function updatePatient(_p: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const id = String(fd.get("id"));
  const data = readPatient(fd);
  if (data.phone.length < 12) return { error: "Telefone inválido (inclua o DDD)." };
  try {
    await db.patient.update({ where: { id, clinicId: user.clinicId }, data });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { error: "Já existe paciente com esse telefone." };
    throw e;
  }
  revalidatePath(`/painel/pacientes/${id}`);
  return { ok: true };
}

export async function deletePatient(fd: FormData) {
  const user = await requireUser();
  if (user.role !== "OWNER") return;
  await db.patient.delete({ where: { id: String(fd.get("id")), clinicId: user.clinicId } });
  revalidatePath("/painel/pacientes");
  redirect("/painel/pacientes");
}
