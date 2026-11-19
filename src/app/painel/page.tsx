import Link from "next/link";
import { DateTime } from "luxon";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatTime } from "@/lib/tz";
import { STATUS_LABEL, STATUS_STYLE } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { Badge, Card, PageHeader } from "@/components/ui";

export const metadata = { title: "Visão geral" };

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <Card className="p-5">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </Card>
  );
}

export default async function Overview({ searchParams }: PageProps<"/painel">) {
  const user = await requireUser();
  const { bemvindo } = await searchParams;
  const clinicId = user.clinicId;
  const tz = user.clinic.timezone;
  const now = DateTime.now().setZone(tz);
  const dayStart = now.startOf("day").toJSDate();
  const dayEnd = now.endOf("day").toJSDate();
  const since30 = now.minus({ days: 30 }).toJSDate();

  const [today, waiting, bot30, total30, past30, noShow30, ratings] = await Promise.all([
    db.appointment.findMany({
      where: { clinicId, start: { gte: dayStart, lte: dayEnd }, status: { not: "CANCELED" } },
      include: { patient: true, dentist: true, procedure: true },
      orderBy: { start: "asc" },
    }),
    db.conversation.findMany({
      where: { clinicId, status: "HUMAN" },
      include: { patient: true },
      orderBy: { lastMessageAt: "desc" },
      take: 5,
    }),
    db.appointment.count({ where: { clinicId, createdAt: { gte: since30 }, source: { in: ["BOT", "AI"] } } }),
    db.appointment.count({ where: { clinicId, createdAt: { gte: since30 } } }),
    db.appointment.count({
      where: { clinicId, start: { gte: since30, lt: new Date() }, status: { in: ["COMPLETED", "NO_SHOW", "CONFIRMED"] } },
    }),
    db.appointment.count({ where: { clinicId, start: { gte: since30, lt: new Date() }, status: "NO_SHOW" } }),
    db.appointment.aggregate({ where: { clinicId, rating: { not: null }, start: { gte: since30 } }, _avg: { rating: true }, _count: true }),
  ]);
  const confirmedToday = today.filter((a) => a.status === "CONFIRMED" || a.status === "COMPLETED").length;

  return (
    <>
      <PageHeader
        title={`Olá, ${user.name.split(" ")[0]}!`}
        description={now.setLocale("pt-BR").toFormat("cccc, dd 'de' LLLL")}
      />

      {bemvindo && (
        <Card className="mb-6 border-brand-200 bg-brand-50 p-5">
          <h2 className="font-semibold text-brand-900">Bem-vindo(a) ao Agendente! 🎉</h2>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-brand-900">
            <li>
              Revise <Link className="underline" href="/painel/configuracoes?aba=profissionais">profissionais e horários</Link> e{" "}
              <Link className="underline" href="/painel/configuracoes?aba=procedimentos">procedimentos</Link>.
            </li>
            <li>
              Teste o atendimento no <Link className="underline" href="/painel/simulador">simulador de WhatsApp</Link>.
            </li>
            <li>
              Conecte seu número em <Link className="underline" href="/painel/configuracoes?aba=whatsapp">Configurações › WhatsApp</Link>.
            </li>
          </ol>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Consultas hoje" value={today.length} hint={`${confirmedToday} confirmada(s) ou concluída(s)`} />
        <Stat
          label="Agendadas pelo robô (30d)"
          value={bot30}
          hint={total30 ? `${Math.round((bot30 / total30) * 100)}% de todos os agendamentos` : "—"}
        />
        <Stat
          label="Taxa de faltas (30d)"
          value={past30 ? `${Math.round((noShow30 / past30) * 100)}%` : "—"}
          hint={`${noShow30} falta(s)`}
        />
        <Stat
          label="Satisfação (30d)"
          value={ratings._avg.rating ? ratings._avg.rating.toFixed(1) : "—"}
          hint={`${ratings._count} avaliação(ões)`}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <h2 className="font-semibold">Agenda de hoje</h2>
            <Link href="/painel/agenda" className="text-sm text-brand-700 hover:underline">
              Abrir agenda →
            </Link>
          </div>
          {today.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-slate-500">Nenhuma consulta hoje.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {today.map((a) => (
                <li key={a.id} className="flex items-center gap-4 px-5 py-3">
                  <span className="w-12 font-mono text-sm font-semibold text-slate-700">{formatTime(a.start, tz)}</span>
                  <span className="h-8 w-1 rounded" style={{ background: a.dentist.color }} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{a.patient.name || formatPhone(a.patient.phone)}</p>
                    <p className="truncate text-xs text-slate-500">
                      {a.procedure.name} · {a.dentist.name}
                    </p>
                  </div>
                  <Badge className={STATUS_STYLE[a.status]}>{STATUS_LABEL[a.status]}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <h2 className="font-semibold">Aguardando a equipe</h2>
            <Link href="/painel/conversas" className="text-sm text-brand-700 hover:underline">
              Ver todas →
            </Link>
          </div>
          {waiting.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-slate-500">O robô está dando conta de tudo 🤖✨</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {waiting.map((c) => (
                <li key={c.id}>
                  <Link href={`/painel/conversas?c=${c.id}`} className="flex items-center justify-between px-5 py-3 hover:bg-slate-50">
                    <span className="truncate text-sm font-medium">{c.patient.name || formatPhone(c.patient.phone)}</span>
                    {c.unread > 0 && (
                      <span className="rounded-full bg-rose-500 px-2 py-0.5 text-xs font-semibold text-white">{c.unread}</span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
