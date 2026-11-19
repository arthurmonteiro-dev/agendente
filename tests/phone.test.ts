import { describe, expect, it } from "vitest";
import { formatPhone, normalizePhone, phoneVariants } from "@/lib/phone";
import { parseChoice } from "@/lib/bot/state";
import { renderTemplate } from "@/lib/automations/settings";

describe("telefone", () => {
  it("normaliza números brasileiros", () => {
    expect(normalizePhone("(11) 99999-8888")).toBe("5511999998888");
    expect(normalizePhone("+55 11 99999-8888")).toBe("5511999998888");
  });
  it("gera variantes com e sem o nono dígito", () => {
    expect(phoneVariants("551199998888").sort()).toEqual(["551199998888", "5511999998888"].sort());
    expect(phoneVariants("5511999998888")).toContain("551199998888");
  });
  it("formata para exibição", () => {
    expect(formatPhone("5511999998888")).toBe("(11) 99999-8888");
  });
});

describe("parseChoice", () => {
  it("entende variações de resposta numérica", () => {
    expect(parseChoice("1")).toBe(1);
    expect(parseChoice(" 2. ")).toBe(2);
    expect(parseChoice("opção 3")).toBe(3);
    expect(parseChoice("2️⃣")).toBe(2);
    expect(parseChoice("quero 2")).toBeNull();
  });
});

describe("renderTemplate", () => {
  it("substitui variáveis", () => {
    expect(renderTemplate("Oi {nome}, {hora} {xyz}", { nome: "Ana", hora: "10:00" })).toBe("Oi Ana, 10:00 {xyz}");
  });
});
