/**
 * Configuração das automações por clínica (salva em Clinic.automations como JSON).
 *
 * Variáveis disponíveis nos textos: {nome} {clinica} {procedimento} {dentista}
 * {data} {hora} {dia} {endereco}
 *
 * waTemplate: nome do template aprovado na Meta (necessário na API oficial para
 * mensagens iniciadas pela clínica fora da janela de 24h). Parâmetros do corpo,
 * nesta ordem: {{1}} nome, {{2}} procedimento, {{3}} dentista, {{4}} dia/data, {{5}} hora.
 */

export interface AutomationConfig {
  enabled: boolean;
  text: string;
  waTemplate?: string;
}

export interface AutomationSettings {
  reminder24h: AutomationConfig;
  reminder2h: AutomationConfig;
  followup: AutomationConfig;
  recall: AutomationConfig & { months: number };
  birthday: AutomationConfig;
}

export const DEFAULT_AUTOMATIONS: AutomationSettings = {
  reminder24h: {
    enabled: true,
    text:
      "Olá, {nome}! 😊 Passando para lembrar da sua consulta de *{procedimento}* com {dentista} " +
      "*{dia} às {hora}* na {clinica}.\n\nResponda:\n*1* para CONFIRMAR\n*2* para REMARCAR ou CANCELAR",
  },
  reminder2h: {
    enabled: true,
    text: "Oi, {nome}! Sua consulta é hoje às *{hora}* com {dentista}. Estamos te esperando! 📍 {endereco}",
  },
  followup: {
    enabled: true,
    text:
      "Olá, {nome}! Obrigado por escolher a {clinica}. 🦷 De 1 a 5, como você avalia seu atendimento de hoje? " +
      "Responda só com o número.",
  },
  recall: {
    enabled: true,
    months: 6,
    text:
      "Olá, {nome}! Já faz um tempinho desde sua última visita à {clinica}. " +
      "Que tal agendar sua revisão e limpeza? Responda *1* para ver os horários disponíveis. 😁",
  },
  birthday: {
    enabled: false,
    text: "Feliz aniversário, {nome}! 🎉 A equipe da {clinica} deseja um ano cheio de sorrisos!",
  },
};

export function getAutomationSettings(raw: unknown): AutomationSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof AutomationSettings, Partial<AutomationConfig>>>;
  const out = structuredClone(DEFAULT_AUTOMATIONS);
  for (const key of Object.keys(out) as (keyof AutomationSettings)[]) {
    const v = r[key];
    if (v && typeof v === "object") Object.assign(out[key], v);
  }
  return out;
}

export function renderTemplate(text: string, vars: Record<string, string | undefined | null>): string {
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (vars[k] ?? "").toString() || (k in vars ? "" : m)).trim();
}
