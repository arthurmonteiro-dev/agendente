import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { cn, PageHeader } from "@/components/ui";
import * as T from "./tabs";

export const metadata = { title: "Configurações" };

const TABS = [
  ["clinica", "Clínica"],
  ["profissionais", "Profissionais e horários"],
  ["procedimentos", "Procedimentos"],
  ["bloqueios", "Bloqueios e feriados"],
  ["whatsapp", "WhatsApp"],
  ["assistente", "Assistente"],
  ["automacoes", "Automações"],
  ["equipe", "Equipe"],
  ["plano", "Plano"],
] as const;

export default async function ConfiguracoesPage({ searchParams }: PageProps<"/painel/configuracoes">) {
  const user = await requireUser();
  const { aba } = await searchParams;
  const tab = TABS.find(([k]) => k === aba)?.[0] ?? "clinica";
  const ownerOnly = ["whatsapp", "assistente", "automacoes", "plano"].includes(tab);

  return (
    <>
      <PageHeader title="Configurações" />
      <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-slate-200">
        {TABS.map(([k, label]) => (
          <Link
            key={k}
            href={`/painel/configuracoes?aba=${k}`}
            className={cn(
              "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium",
              tab === k ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800",
            )}
          >
            {label}
          </Link>
        ))}
      </nav>
      {ownerOnly && user.role !== "OWNER" ? (
        <p className="text-sm text-slate-500">Apenas o responsável pela conta pode alterar esta seção.</p>
      ) : (
        <>
          {tab === "clinica" && <T.ClinicTab clinic={user.clinic} />}
          {tab === "profissionais" && <T.DentistsTab clinicId={user.clinicId} />}
          {tab === "procedimentos" && <T.ProceduresTab clinicId={user.clinicId} />}
          {tab === "bloqueios" && <T.TimeOffTab clinic={user.clinic} />}
          {tab === "whatsapp" && <T.WhatsAppTab clinic={user.clinic} />}
          {tab === "assistente" && <T.AssistantTab clinic={user.clinic} />}
          {tab === "automacoes" && <T.AutomationsTab clinic={user.clinic} />}
          {tab === "equipe" && (user.role === "OWNER" ? <T.TeamTab clinicId={user.clinicId} meId={user.id} /> : <T.PasswordSection />)}
          {tab === "plano" && <T.PlanTab clinic={user.clinic} />}
        </>
      )}
    </>
  );
}
