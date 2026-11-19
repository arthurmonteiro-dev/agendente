/**
 * Utilitários de telefone (foco em números brasileiros).
 * Armazenamos sempre só dígitos com DDI: 5511999998888.
 */

export function normalizePhone(input: string): string {
  let digits = (input || "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  // Número nacional (DDD + número) sem DDI → assume Brasil
  if (digits.length === 10 || digits.length === 11) digits = "55" + digits;
  return digits;
}

/**
 * O WhatsApp às vezes entrega números brasileiros de celular sem o 9º dígito
 * (ex.: 551199998888 em vez de 5511999998888). Gera as duas variantes para busca.
 */
export function phoneVariants(phone: string): string[] {
  const p = normalizePhone(phone);
  const variants = new Set([p]);
  if (p.startsWith("55")) {
    const ddd = p.slice(2, 4);
    const rest = p.slice(4);
    if (rest.length === 8 && /^[6-9]/.test(rest)) variants.add(`55${ddd}9${rest}`);
    if (rest.length === 9 && rest.startsWith("9")) variants.add(`55${ddd}${rest.slice(1)}`);
  }
  return [...variants];
}

export function formatPhone(phone: string): string {
  const p = normalizePhone(phone);
  if (p.startsWith("55") && (p.length === 12 || p.length === 13)) {
    const ddd = p.slice(2, 4);
    const rest = p.slice(4);
    const head = rest.length === 9 ? rest.slice(0, 5) : rest.slice(0, 4);
    const tail = rest.slice(head.length);
    return `(${ddd}) ${head}-${tail}`;
  }
  return p ? `+${p}` : "";
}
