import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { requireUser, isSuperAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { PLANS } from "@/lib/plans";
import { Card, Logo, PageHeader } from "@/components/ui";

export const metadata = { title: "Admin" };

async function setPlan(fd: FormData) {
  "use server";
  const user = await requireUser();
  if (!isSuperAdmin(user.email)) return;
  const plan = String(fd.get("plan"));
  if (![...PLANS.map((p) => p.id), "trial"].includes(plan)) return;
  await db.clinic.update({ where: { id: String(fd.get("id")) }, data: { plan } });
  revalidatePath("/admin");
}

/** Painel do dono do SaaS (e-mails em ADMIN_EMAILS). */
export default async function AdminPage() {
  const user = await requireUser();
  if (!isSuperAdmin(user.email)) notFound();
  const since = new Date(Date.now() - 30 * 86_400_000);
  const clinics = await db.clinic.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      users: { where: { role: "OWNER" }, take: 1, select: { email: true, name: true } },
      _count: { select: { patients: true, dentists: true } },
    },
  });
  const stats = await db.appointment.groupBy({ by: ["clinicId"], where: { createdAt: { gte: since } }, _count: true });
  const msgs = await db.message.groupBy({ by: ["clinicId"], where: { createdAt: { gte: since } }, _count: true });
  const mrr = clinics.reduce((sum, c) => sum + (PLANS.find((p) => p.id === c.plan)?.priceCents ?? 0), 0);

  return (
    <div className="mx-auto w-full max-w-7xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <Logo />
        <Link href="/painel" className="text-sm text-brand-700 hover:underline">← Voltar ao painel</Link>
      </div>
      <PageHeader title="Admin do SaaS" description={`${clinics.length} clínica(s) · MRR estimado ${(mrr / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`} />
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Clínica</th><th className="px-4 py-3">Responsável</th><th className="px-4 py-3">WhatsApp</th>
              <th className="px-4 py-3">Pacientes</th><th className="px-4 py-3">Consultas 30d</th><th className="px-4 py-3">Mensagens 30d</th>
              <th className="px-4 py-3">Plano</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {clinics.map((c) => (
              <tr key={c.id}>
                <td className="px-4 py-3"><p className="font-medium">{c.name}</p><p className="text-xs text-slate-400">desde {c.createdAt.toLocaleDateString("pt-BR")}</p></td>
                <td className="px-4 py-3 text-slate-600">{c.users[0]?.name}<br /><span className="text-xs">{c.users[0]?.email}</span></td>
                <td className="px-4 py-3 text-slate-600">{c.waProvider}</td>
                <td className="px-4 py-3">{c._count.patients}</td>
                <td className="px-4 py-3">{stats.find((s) => s.clinicId === c.id)?._count ?? 0}</td>
                <td className="px-4 py-3">{msgs.find((s) => s.clinicId === c.id)?._count ?? 0}</td>
                <td className="px-4 py-3">
                  <form action={setPlan} className="flex gap-1">
                    <input type="hidden" name="id" value={c.id} />
                    <select name="plan" defaultValue={c.plan} className="rounded border border-slate-300 px-2 py-1 text-xs">
                      <option value="trial">trial</option>
                      {PLANS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <button className="rounded bg-slate-800 px-2 text-xs text-white cursor-pointer">ok</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
