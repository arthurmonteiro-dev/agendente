import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatPhone } from "@/lib/phone";
import { formatDate } from "@/lib/tz";
import { ActionForm } from "@/components/ActionForm";
import { Card, Input, PageHeader } from "@/components/ui";
import { createPatient } from "./actions";
import { PatientFields } from "./PatientFields";

export const metadata = { title: "Pacientes" };

export default async function PacientesPage({ searchParams }: PageProps<"/painel/pacientes">) {
  const user = await requireUser();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const novo = sp.novo === "1";
  const digits = q.replace(/\D/g, "");
  const where = {
    clinicId: user.clinicId,
    ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : [])] } : {}),
  };
  const [patients, total] = await Promise.all([
    db.patient.findMany({
      where,
      include: {
        appointments: { where: { status: { not: "CANCELED" } }, orderBy: { start: "desc" }, take: 1, select: { start: true } },
        _count: { select: { appointments: true } },
      },
      orderBy: [{ name: "asc" }],
      take: 200,
    }),
    db.patient.count({ where: { clinicId: user.clinicId } }),
  ]);
  const tz = user.clinic.timezone;

  return (
    <>
      <PageHeader
        title="Pacientes"
        description={`${total} paciente(s) cadastrados — o robô cadastra automaticamente quem chama no WhatsApp.`}
        actions={
          <Link href={novo ? "/painel/pacientes" : "/painel/pacientes?novo=1"} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
            {novo ? "Fechar" : "+ Novo paciente"}
          </Link>
        }
      />
      {novo && (
        <Card className="mb-6 p-5">
          <h2 className="mb-4 font-semibold">Novo paciente</h2>
          <ActionForm action={createPatient} submitLabel="Cadastrar">
            <PatientFields />
          </ActionForm>
        </Card>
      )}
      <form className="mb-4">
        <Input name="q" defaultValue={q} placeholder="Buscar por nome ou telefone…" className="max-w-sm" />
      </form>
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">WhatsApp</th>
              <th className="px-4 py-3">Consultas</th>
              <th className="px-4 py-3">Última/próxima</th>
              <th className="px-4 py-3">Cadastro</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {patients.map((p) => (
              <tr key={p.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <Link href={`/painel/pacientes/${p.id}`} className="font-medium text-slate-900 hover:text-brand-700">
                    {p.name || <span className="italic text-slate-400">sem nome</span>}
                  </Link>
                  {p.optOut && <span className="ml-2 text-xs text-slate-400">(sem automações)</span>}
                </td>
                <td className="px-4 py-3 text-slate-600">{formatPhone(p.phone)}</td>
                <td className="px-4 py-3 text-slate-600">{p._count.appointments}</td>
                <td className="px-4 py-3 text-slate-600">{p.appointments[0] ? formatDate(p.appointments[0].start, tz) : "—"}</td>
                <td className="px-4 py-3 text-slate-500">{formatDate(p.createdAt, tz)}</td>
              </tr>
            ))}
            {patients.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-slate-500">Nenhum paciente encontrado.</td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </>
  );
}
