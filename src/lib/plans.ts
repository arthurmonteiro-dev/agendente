import type { Clinic } from "@prisma/client";

export interface Plan {
  id: string;
  name: string;
  priceCents: number;
  maxDentists: number;
  ai: boolean;
  highlights: string[];
}

/** Planos sugeridos — ajuste preços e limites ao seu modelo de negócio. */
export const PLANS: Plan[] = [
  {
    id: "essencial",
    name: "Essencial",
    priceCents: 14900,
    maxDentists: 2,
    ai: false,
    highlights: ["Até 2 profissionais", "Robô de agendamento 24h (menu)", "Lembretes e confirmação automática", "Agenda online e caixa de conversas"],
  },
  {
    id: "profissional",
    name: "Profissional",
    priceCents: 27900,
    maxDentists: 6,
    ai: true,
    highlights: ["Até 6 profissionais", "Assistente com IA que conversa naturalmente", "Pesquisa de satisfação e retorno de 6 meses", "Tudo do Essencial"],
  },
  {
    id: "clinica",
    name: "Clínica+",
    priceCents: 49900,
    maxDentists: 20,
    ai: true,
    highlights: ["Até 20 profissionais", "Suporte prioritário e onboarding assistido", "Templates oficiais da Meta configurados", "Tudo do Profissional"],
  },
];

export function currentPlan(clinic: Pick<Clinic, "plan" | "trialEndsAt">) {
  if (clinic.plan === "trial") {
    const active = !clinic.trialEndsAt || clinic.trialEndsAt > new Date();
    return { ...PLANS[2], id: "trial", name: active ? "Teste grátis" : "Teste expirado", active };
  }
  const plan = PLANS.find((p) => p.id === clinic.plan) ?? PLANS[0];
  return { ...plan, active: true };
}
