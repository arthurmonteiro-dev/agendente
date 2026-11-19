"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Button, Card, Input, cn } from "@/components/ui";

type Status = "BOT" | "HUMAN" | "CLOSED";
interface ConvItem {
  id: string;
  status: Status;
  channel: "WHATSAPP" | "SIMULATOR";
  unread: number;
  lastMessageAt: string;
  patient: { id: string; name: string | null; phone: string };
  lastMessage: { body: string; sender: string; createdAt: string } | null;
}
interface Msg {
  id: string;
  direction: "IN" | "OUT";
  sender: "PATIENT" | "BOT" | "STAFF" | "SYSTEM";
  body: string;
  status: string;
  error: string | null;
  createdAt: string;
}
interface Detail {
  conversation: { id: string; status: Status; channel: string; patient: { id: string; name: string | null; phone: string; optOut: boolean }; messages: Msg[] };
  appointments: { id: string; start: string; procedure: { name: string }; dentist: { name: string }; status: string }[];
}

const STATUS_BADGE: Record<Status, { label: string; cls: string }> = {
  BOT: { label: "🤖 Robô", cls: "border-sky-200 bg-sky-50 text-sky-700" },
  HUMAN: { label: "🙋 Equipe", cls: "border-rose-200 bg-rose-50 text-rose-700" },
  CLOSED: { label: "Encerrada", cls: "border-slate-200 bg-slate-50 text-slate-500" },
};
const SENDER_LABEL = { BOT: "Robô", STAFF: "Equipe", SYSTEM: "Automação", PATIENT: "" } as const;

export function InboxClient({ initialId, tz }: { initialId: string | null; tz: string }) {
  const [filter, setFilter] = useState<"" | Status>("");
  const [q, setQ] = useState("");
  const [items, setItems] = useState<ConvItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(initialId);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const lastCount = useRef(0);

  const fmt = useCallback(
    (iso: string, withDate = false) =>
      new Intl.DateTimeFormat("pt-BR", { timeZone: tz, hour: "2-digit", minute: "2-digit", ...(withDate ? { day: "2-digit", month: "2-digit" } : {}) }).format(new Date(iso)),
    [tz],
  );

  const loadList = useCallback(async () => {
    const res = await fetch(`/api/conversations?status=${filter}&q=${encodeURIComponent(q)}`);
    if (res.ok) setItems((await res.json()).conversations);
  }, [filter, q]);

  const loadDetail = useCallback(async () => {
    if (!activeId) return;
    const res = await fetch(`/api/conversations/${activeId}`);
    if (res.ok) setDetail(await res.json());
  }, [activeId]);

  useEffect(() => {
    loadList();
    const t = setInterval(loadList, 5000);
    return () => clearInterval(t);
  }, [loadList]);

  useEffect(() => {
    setDetail(null);
    lastCount.current = 0;
    loadDetail();
    const t = setInterval(loadDetail, 3000);
    return () => clearInterval(t);
  }, [loadDetail]);

  useEffect(() => {
    const n = detail?.conversation.messages.length ?? 0;
    if (n !== lastCount.current) {
      lastCount.current = n;
      bottom.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [detail]);

  async function setStatus(status: Status) {
    if (!activeId) return;
    await fetch(`/api/conversations/${activeId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    loadDetail();
    loadList();
  }

  async function send() {
    if (!activeId || !text.trim()) return;
    setSending(true);
    const res = await fetch(`/api/conversations/${activeId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: text }),
    });
    setSending(false);
    if (res.ok) {
      setText("");
      loadDetail();
      loadList();
    }
  }

  const conv = detail?.conversation;

  return (
    <div className="flex h-[calc(100vh-7rem)] min-h-[520px] flex-col">
      <h1 className="mb-4 text-2xl font-semibold tracking-tight">Conversas</h1>
      <Card className="grid min-h-0 flex-1 overflow-hidden md:grid-cols-[320px_1fr]">
        <div className={cn("flex min-h-0 flex-col border-r border-slate-200", activeId && "hidden md:flex")}>
          <div className="space-y-2 border-b border-slate-100 p-3">
            <Input placeholder="Buscar paciente…" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="flex gap-1 text-xs">
              {([["", "Todas"], ["HUMAN", "Aguardando"], ["BOT", "Robô"], ["CLOSED", "Encerradas"]] as const).map(([v, l]) => (
                <button key={v} onClick={() => setFilter(v)} className={cn("whitespace-nowrap rounded-full px-2.5 py-1 cursor-pointer", filter === v ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200")}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <ul className="min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto">
            {items.length === 0 && <li className="p-6 text-center text-sm text-slate-500">Nenhuma conversa.</li>}
            {items.map((c) => (
              <li key={c.id}>
                <button onClick={() => setActiveId(c.id)} className={cn("w-full px-4 py-3 text-left hover:bg-slate-50 cursor-pointer", activeId === c.id && "bg-brand-50")}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{c.patient.name || c.patient.phone}</span>
                    <span className="shrink-0 text-[11px] text-slate-400">{fmt(c.lastMessageAt, true)}</span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2">
                    <span className="flex-1 truncate text-xs text-slate-500">
                      {c.lastMessage ? `${c.lastMessage.sender !== "PATIENT" ? "↩ " : ""}${c.lastMessage.body}` : ""}
                    </span>
                    {c.status === "HUMAN" && <span className="h-2 w-2 shrink-0 rounded-full bg-rose-500" title="Aguardando equipe" />}
                    {c.unread > 0 && <span className="rounded-full bg-emerald-500 px-1.5 text-[10px] font-semibold text-white">{c.unread}</span>}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className={cn("flex min-h-0 flex-col", !activeId && "hidden md:flex")}>
          {!conv ? (
            <div className="flex flex-1 items-center justify-center text-sm text-slate-500">
              {activeId ? "Carregando…" : "Selecione uma conversa"}
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-4 py-3">
                <button className="md:hidden text-slate-500 cursor-pointer" onClick={() => setActiveId(null)}>←</button>
                <div className="min-w-0 flex-1">
                  <Link href={`/painel/pacientes/${conv.patient.id}`} className="font-semibold hover:underline">
                    {conv.patient.name || "Paciente sem nome"}
                  </Link>
                  <p className="text-xs text-slate-500">
                    {conv.patient.phone} {conv.channel === "SIMULATOR" && "· simulador"} {conv.patient.optOut && "· não recebe automações"}
                  </p>
                </div>
                <Badge className={STATUS_BADGE[conv.status].cls}>{STATUS_BADGE[conv.status].label}</Badge>
                {conv.status !== "HUMAN" && <Button size="sm" variant="secondary" onClick={() => setStatus("HUMAN")}>Assumir atendimento</Button>}
                {conv.status !== "BOT" && <Button size="sm" variant="secondary" onClick={() => setStatus("BOT")}>Devolver ao robô</Button>}
                {conv.status !== "CLOSED" && <Button size="sm" variant="ghost" onClick={() => setStatus("CLOSED")}>Encerrar</Button>}
              </div>
              {detail.appointments.length > 0 && (
                <div className="flex gap-2 overflow-x-auto border-b border-slate-100 bg-slate-50 px-4 py-2 text-xs">
                  {detail.appointments.map((a) => (
                    <span key={a.id} className="whitespace-nowrap rounded-full border border-slate-200 bg-white px-2 py-1">
                      📅 {fmt(a.start, true)} · {a.procedure.name} · {a.status === "CONFIRMED" ? "✓ confirmada" : "aguardando"}
                    </span>
                  ))}
                </div>
              )}
              <div className="wa-bg min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
                {conv.messages.map((m) => (
                  <div key={m.id} className={cn("flex", m.direction === "OUT" ? "justify-end" : "justify-start")}>
                    <div
                      className={cn(
                        "max-w-[80%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm shadow-sm",
                        m.direction === "OUT" ? (m.sender === "STAFF" ? "bg-[#d9fdd3]" : "bg-[#e7f6f4]") : "bg-white",
                      )}
                    >
                      {m.direction === "OUT" && <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-700">{SENDER_LABEL[m.sender]}</p>}
                      <WaText text={m.body} />
                      <p className="mt-1 text-right text-[10px] text-slate-400">
                        {fmt(m.createdAt, true)}
                        {m.status === "FAILED" && <span className="ml-1 text-rose-600" title={m.error ?? ""}>· falhou</span>}
                        {m.status === "READ" && <span className="ml-1 text-sky-500">✓✓</span>}
                        {m.status === "DELIVERED" && <span className="ml-1">✓✓</span>}
                      </p>
                    </div>
                  </div>
                ))}
                <div ref={bottom} />
              </div>
              <form
                className="flex gap-2 border-t border-slate-200 p-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  send();
                }}
              >
                <Input
                  placeholder={conv.status === "HUMAN" ? "Escreva uma mensagem…" : "Ao enviar, o robô pausa e você assume a conversa"}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
                <Button type="submit" disabled={sending || !text.trim()}>Enviar</Button>
              </form>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}

/** Renderiza *negrito* e _itálico_ do WhatsApp. */
export function WaText({ text }: { text: string }) {
  const parts = text.split(/(\*[^*\n]+\*|_[^_\n]+_)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("*") && p.endsWith("*") && p.length > 2 ? (
          <strong key={i}>{p.slice(1, -1)}</strong>
        ) : p.startsWith("_") && p.endsWith("_") && p.length > 2 ? (
          <em key={i}>{p.slice(1, -1)}</em>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}
