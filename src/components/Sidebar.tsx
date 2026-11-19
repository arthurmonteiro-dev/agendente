"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn, Logo } from "./ui";

const NAV = [
  { href: "/painel", label: "Visão geral", icon: "M3 12l9-9 9 9M5 10v10h14V10" },
  { href: "/painel/agenda", label: "Agenda", icon: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z" },
  { href: "/painel/conversas", label: "Conversas", icon: "M21 12a8 8 0 01-11.6 7.1L3 21l1.9-6.4A8 8 0 1121 12z" },
  { href: "/painel/pacientes", label: "Pacientes", icon: "M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM22 21v-2a4 4 0 00-3-3.9M16 3.1a4 4 0 010 7.8" },
  { href: "/painel/simulador", label: "Simulador", icon: "M12 18h.01M8 2h8a2 2 0 012 2v16a2 2 0 01-2 2H8a2 2 0 01-2-2V4a2 2 0 012-2z" },
  { href: "/painel/configuracoes", label: "Configurações", icon: "M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" },
];

export function Sidebar({
  clinicName,
  userName,
  initialPending,
  isAdmin,
  logout,
}: {
  clinicName: string;
  userName: string;
  initialPending: number;
  isAdmin: boolean;
  logout: () => Promise<void>;
}) {
  const pathname = usePathname();
  const [pending, setPending] = useState(initialPending);
  const [open, setOpen] = useState(false);

  // Contador de conversas aguardando a equipe (atualiza a cada 15s)
  useEffect(() => {
    const t = setInterval(async () => {
      const res = await fetch("/api/conversations?status=HUMAN").catch(() => null);
      if (!res?.ok) return;
      const json = (await res.json()) as { conversations: { unread: number }[] };
      setPending(json.conversations.filter((c) => c.unread > 0).length);
    }, 15_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const nav = (
    <nav className="flex flex-1 flex-col gap-1 p-3">
      {NAV.map((item) => {
        const active = item.href === "/painel" ? pathname === "/painel" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
              active ? "bg-brand-50 text-brand-800" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
            )}
          >
            <svg viewBox="0 0 24 24" className="h-4.5 w-4.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <path d={item.icon} />
            </svg>
            <span className="flex-1">{item.label}</span>
            {item.href === "/painel/conversas" && pending > 0 && (
              <span className="rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">{pending}</span>
            )}
          </Link>
        );
      })}
      {isAdmin && (
        <Link href="/admin" className="mt-2 rounded-lg px-3 py-2 text-sm font-medium text-violet-700 hover:bg-violet-50">
          ⚙ Admin do SaaS
        </Link>
      )}
    </nav>
  );

  return (
    <>
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
        <Logo />
        <button onClick={() => setOpen(!open)} className="rounded-lg p-2 hover:bg-slate-100" aria-label="Menu">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </header>
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-slate-200 bg-white transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="border-b border-slate-100 px-5 py-4">
          <Logo />
          <p className="mt-2 truncate text-xs text-slate-500">{clinicName}</p>
        </div>
        {nav}
        <div className="border-t border-slate-100 p-4 text-sm">
          <p className="truncate font-medium text-slate-700">{userName}</p>
          <form action={logout}>
            <button className="mt-1 text-xs text-slate-500 hover:text-rose-600 cursor-pointer">Sair</button>
          </form>
        </div>
      </aside>
      {open && <div className="fixed inset-0 z-30 bg-black/20 lg:hidden" onClick={() => setOpen(false)} />}
    </>
  );
}
