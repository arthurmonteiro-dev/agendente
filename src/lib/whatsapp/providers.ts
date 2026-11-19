import type { Clinic } from "@prisma/client";
import { decryptSecret } from "../crypto";

/**
 * Provedores de WhatsApp.
 * - CLOUD: API oficial da Meta (WhatsApp Cloud API). Recomendado para produção.
 * - EVOLUTION: Evolution API (não oficial, baseada no WhatsApp Web). Sem custo por conversa,
 *   mas com risco de bloqueio do número pela Meta — use por sua conta e risco.
 * - SIMULATOR: não envia nada; as mensagens ficam só no banco (painel > Simulador).
 */

export interface SendResult {
  ok: boolean;
  providerMessageId?: string;
  error?: string;
}

export interface TemplateMessage {
  name: string;
  language?: string;
  bodyParams: string[];
}

export interface WhatsAppProvider {
  kind: "CLOUD" | "EVOLUTION" | "SIMULATOR";
  sendText(to: string, body: string): Promise<SendResult>;
  sendTemplate?(to: string, tpl: TemplateMessage): Promise<SendResult>;
}

const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || "v21.0";

class CloudProvider implements WhatsAppProvider {
  kind = "CLOUD" as const;
  constructor(private phoneNumberId: string, private token: string) {}

  private async post(payload: object): Promise<SendResult> {
    try {
      const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${this.phoneNumberId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", ...payload }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        messages?: { id: string }[];
        error?: { message?: string; code?: number };
      };
      if (!res.ok) {
        return { ok: false, error: `${json.error?.code ?? res.status}: ${json.error?.message ?? res.statusText}` };
      }
      return { ok: true, providerMessageId: json.messages?.[0]?.id };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  sendText(to: string, body: string) {
    return this.post({ to, type: "text", text: { body, preview_url: false } });
  }

  sendTemplate(to: string, tpl: TemplateMessage) {
    return this.post({
      to,
      type: "template",
      template: {
        name: tpl.name,
        language: { code: tpl.language || "pt_BR" },
        components: tpl.bodyParams.length
          ? [{ type: "body", parameters: tpl.bodyParams.map((text) => ({ type: "text", text })) }]
          : [],
      },
    });
  }
}

class EvolutionProvider implements WhatsAppProvider {
  kind = "EVOLUTION" as const;
  constructor(private baseUrl: string, private instance: string, private apiKey: string) {}

  async sendText(to: string, body: string): Promise<SendResult> {
    try {
      const res = await fetch(`${this.baseUrl.replace(/\/$/, "")}/message/sendText/${encodeURIComponent(this.instance)}`, {
        method: "POST",
        headers: { apikey: this.apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ number: to, text: body }),
      });
      const json = (await res.json().catch(() => ({}))) as { key?: { id?: string }; message?: string };
      // Não repassamos o corpo da resposta (evita expor conteúdo de outros servidores)
      if (!res.ok) return { ok: false, error: `Evolution API respondeu ${res.status}` };
      return { ok: true, providerMessageId: json.key?.id };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
}

class SimulatorProvider implements WhatsAppProvider {
  kind = "SIMULATOR" as const;
  async sendText(): Promise<SendResult> {
    return { ok: true };
  }
}

export const simulatorProvider = new SimulatorProvider();

/**
 * Confirma com a Meta que o token informado realmente tem acesso a esse Phone Number ID.
 * Impede que uma clínica "reivindique" o número de outra e passe a receber as mensagens dela.
 */
export async function verifyCloudNumber(
  phoneNumberId: string,
  token: string,
): Promise<{ ok: true; display: string } | { ok: false; error: string }> {
  if (!/^\d{5,30}$/.test(phoneNumberId)) return { ok: false, error: "Phone Number ID inválido (só números)." };
  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}?fields=display_phone_number,verified_name`,
      { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) },
    );
    const json = (await res.json().catch(() => ({}))) as { display_phone_number?: string; verified_name?: string };
    if (!res.ok) return { ok: false, error: "A Meta não confirmou: o token não tem acesso a esse número." };
    return { ok: true, display: `${json.verified_name ?? ""} ${json.display_phone_number ?? ""}`.trim() };
  } catch {
    return { ok: false, error: "Não foi possível falar com a Meta para confirmar o número. Tente de novo." };
  }
}

/** Bloqueia URLs que apontem para a rede interna do servidor (proteção contra SSRF). */
export function validateExternalUrl(raw: string): { ok: true; url: string } | { ok: false; error: string } {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { ok: false, error: "URL inválida." };
  }
  if (u.protocol !== "https:") return { ok: false, error: "Use um endereço https://" };
  if (u.username || u.password) return { ok: false, error: "A URL não pode conter usuário ou senha." };
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const privateHost =
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    !host.includes(".") ||
    /^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(host) ||
    /^[0-9.]+$/.test(host) ||
    host.includes(":");
  if (privateHost) return { ok: false, error: "Use o domínio público do seu servidor da Evolution (não IP nem endereço interno)." };
  return { ok: true, url: `${u.origin}${u.pathname.replace(/\/$/, "")}` };
}

export function getProvider(clinic: Clinic, channel: "WHATSAPP" | "SIMULATOR"): WhatsAppProvider {
  if (channel === "SIMULATOR") return simulatorProvider;
  const waToken = decryptSecret(clinic.waAccessToken);
  if (clinic.waProvider === "CLOUD" && clinic.waPhoneNumberId && waToken) {
    return new CloudProvider(clinic.waPhoneNumberId, waToken);
  }
  const evoKey = decryptSecret(clinic.evoApiKey);
  if (clinic.waProvider === "EVOLUTION" && clinic.evoBaseUrl && clinic.evoInstance && evoKey && validateExternalUrl(clinic.evoBaseUrl).ok) {
    return new EvolutionProvider(clinic.evoBaseUrl, clinic.evoInstance, evoKey);
  }
  return simulatorProvider;
}
