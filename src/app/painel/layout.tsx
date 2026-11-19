import { requireUser, isSuperAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { Sidebar } from "@/components/Sidebar";
import { logoutAction } from "../(auth)/actions";

export default async function PainelLayout({ children }: LayoutProps<"/painel">) {
  const user = await requireUser();
  const pending = await db.conversation.count({
    where: { clinicId: user.clinicId, status: "HUMAN", unread: { gt: 0 } },
  });
  const trialDaysLeft =
    user.clinic.plan === "trial" && user.clinic.trialEndsAt
      ? Math.ceil((user.clinic.trialEndsAt.getTime() - Date.now()) / 86_400_000)
      : null;

  return (
    <div className="flex min-h-screen flex-1 flex-col lg:flex-row">
      <Sidebar
        clinicName={user.clinic.name}
        userName={user.name}
        initialPending={pending}
        isAdmin={isSuperAdmin(user.email)}
        logout={logoutAction}
      />
      <main className="min-w-0 flex-1">
        {trialDaysLeft !== null && (
          <div className="border-b border-amber-200 bg-amber-50 px-6 py-2 text-center text-xs text-amber-800">
            {trialDaysLeft > 0
              ? `Período de teste: ${trialDaysLeft} dia(s) restante(s).`
              : "Seu período de teste terminou."}{" "}
            <a href="/painel/configuracoes?aba=plano" className="font-semibold underline">
              Ver planos
            </a>
          </div>
        )}
        <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">{children}</div>
      </main>
    </div>
  );
}
