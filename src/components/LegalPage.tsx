import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "./ui";

export const LEGAL_VERSION = "19 de novembro de 2026";

export function legalInfo() {
  return {
    company: process.env.LEGAL_COMPANY || "Agendente",
    email: process.env.LEGAL_CONTACT_EMAIL || process.env.SALES_EMAIL || "privacidade@agendente.com.br",
  };
}

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex-1 bg-white">
      <header className="border-b border-slate-100">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link href="/"><Logo /></Link>
          <nav className="space-x-4 text-sm text-slate-600">
            <Link href="/termos" className="hover:underline">Termos</Link>
            <Link href="/privacidade" className="hover:underline">Privacidade</Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-slate-500">Versão de {LEGAL_VERSION}</p>
        <div className="legal mt-8 space-y-4 text-[15px] leading-relaxed text-slate-700 [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-slate-900 [&_li]:ml-5 [&_li]:list-disc [&_strong]:text-slate-900">
          {children}
        </div>
      </main>
    </div>
  );
}
