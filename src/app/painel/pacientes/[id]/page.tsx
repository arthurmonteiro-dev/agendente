import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatPhone } from "@/lib/phone";
import { formatDayTime } from "@/lib/tz";
import { STATUS_LABEL, STATUS_STYLE } from "@/lib/format";
import { ActionForm } from "@/components/ActionForm";
import { Badge, Button, Card, PageHeader } from "@/components/ui";
import { deletePatient, updatePatient } from "../actions";
import { PatientFields } from "../PatientFields";

export default async function PacientePage({ params }: PageProps<"/painel/pacientes/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const p = await db.patient.findFirst({
    where: { id, clinicId: user.clinicId },
    include: {
      appointments: { include: { procedure: true, dentist: true }, orderBy: { start: "desc" } },
      conversations: { select: { id: true, status: true } },
    },
  });
  if (!p) notFound();
  const tz = user.clinic.timezone;
  const conv = p.conversations[0];

  return (
    <>
      <PageHeader
        title={p.name || "Paciente sem nome"}
        description={formatPhone(p.phone)}
        actions={
          <>
            {conv && (
              <Link href={`/painel/conversas?c=${conv.id}`} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm hover:bg-slate-50">
                Abrir conversa
              </Link>
            )}
            <a href={`https://wa.me/${p.phone}`} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm hover:bg-slate-50">
              WhatsApp ↗
            </a>
          </>
        }
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_400px]">
        <Card className="p-5">
          <h2 className="mb-4 font-semibold">Dados</h2>
          <ActionForm action={updatePatient}>
            <PatientFields p={p} />
          </ActionForm>
          {user.role === "OWNER" && (
            <form action={deletePatient} className="mt-6 border-t border-slate-100 pt-4">
              <input type="hidden" name="id" value={p.id} />
              <Button variant="ghost" size="sm" className="text-rose-600">Excluir paciente e histórico (LGPD)</Button>
            </form>
          )}
        </Card>
        <Card>
          <h2 className="border-b border-slate-100 px-5 py-4 font-semibold">Histórico de consultas</h2>
          {p.appointments.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-slate-500">Nenhuma consulta.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {p.appointments.map((a) => (
                <li key={a.id} className="px-5 py-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium capitalize">{formatDayTime(a.start, tz)}</span>
                    <Badge className={STATUS_STYLE[a.status]}>{STATUS_LABEL[a.status]}</Badge>
                  </div>
                  <p className="text-slate-500">
                    {a.procedure.name} · {a.dentist.name}
                    {a.rating ? ` · ⭐ ${a.rating}/5` : ""}
                  </p>
                  {a.notes && <p className="mt-1 text-xs text-slate-400">{a.notes}</p>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
