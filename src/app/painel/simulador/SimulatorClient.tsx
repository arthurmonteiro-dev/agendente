"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Card, Field, Input, cn } from "@/components/ui";
import { WaText } from "../conversas/InboxClient";

interface Msg {
  id: string;
  direction: "IN" | "OUT";
  sender: string;
  body: string;
  createdAt: string;
}

const QUICK = ["Oi", "Quero agendar uma limpeza", "Estou com muita dor de dente", "Quais formas de pagamento?", "Quero remarcar minha consulta"];

export function SimulatorClient({ clinicName, modeLabel, botEnabled }: { clinicName: string; modeLabel: string; botEnabled: boolean }) {
  const [phone, setPhone] = useState("(11) 90000-0001");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const bottom = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/simulator?phone=${encodeURIComponent(phone)}`);
    if (res.ok) {
      const j = await res.json();
      setMessages(j.messages);
      setStatus(j.status);
    }
  }, [phone]);

  useEffect(() => {
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function send(body: string) {
    if (!body.trim()) return;
    setBusy(true);
    setError("");
    setMessages((m) => [...m, { id: `tmp-${Date.now()}`, direction: "IN", sender: "PATIENT", body, createdAt: new Date().toISOString() }]);
    setText("");
    const res = await fetch("/api/simulator", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone, text: body }) });
    if (!res.ok) setError((await res.json().catch(() => ({}))).error || "Erro");
    await load();
    setBusy(false);
  }

  async function reset() {
    await fetch("/api/simulator", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone, reset: true }) });
    load();
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_380px]">
      <Card className="mx-auto flex h-[640px] w-full max-w-md flex-col overflow-hidden">
        <div className="flex items-center gap-3 bg-[#075e54] px-4 py-3 text-white">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-lg">🦷</div>
          <div className="min-w-0">
            <p className="truncate font-semibold">{clinicName}</p>
            <p className="text-xs text-white/70">{busy ? "digitando…" : status === "HUMAN" ? "atendimento humano" : "online"}</p>
          </div>
        </div>
        <div className="wa-bg min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
          {messages.length === 0 && (
            <p className="mx-auto mt-10 max-w-xs rounded-lg bg-white/80 p-3 text-center text-xs text-slate-600">
              Envie uma mensagem para começar. Ex.: “Oi” ou “quero agendar”.
            </p>
          )}
          {messages.map((m) => (
            <div key={m.id} className={cn("flex", m.direction === "IN" ? "justify-end" : "justify-start")}>
              <div className={cn("max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm shadow-sm", m.direction === "IN" ? "bg-[#d9fdd3]" : "bg-white")}>
                {m.direction === "OUT" && m.sender !== "BOT" && (
                  <p className="mb-0.5 text-[10px] font-semibold uppercase text-brand-700">{m.sender === "STAFF" ? "Equipe" : "Automação"}</p>
                )}
                <WaText text={m.body} />
                <p className="mt-1 text-right text-[10px] text-slate-400">
                  {new Date(m.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>
          ))}
          <div ref={bottom} />
        </div>
        <form className="flex gap-2 bg-[#f0f2f5] p-2" onSubmit={(e) => { e.preventDefault(); send(text); }}>
          <input
            className="flex-1 rounded-full border-0 bg-white px-4 py-2 text-sm outline-none"
            placeholder="Mensagem"
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={busy}
          />
          <button className="flex h-9 w-9 items-center justify-center rounded-full bg-[#00a884] text-white disabled:opacity-50 cursor-pointer" disabled={busy || !text.trim()} aria-label="Enviar">
            ➤
          </button>
        </form>
      </Card>

      <div className="space-y-4">
        <Card className="p-5">
          <h2 className="font-semibold">Configuração do teste</h2>
          <p className="mt-1 text-sm text-slate-500">Modo atual: <strong>{modeLabel}</strong>{!botEnabled && " (robô desativado)"}</p>
          <div className="mt-4">
            <Field label="Telefone do paciente fictício" hint="Use números diferentes para simular pacientes diferentes.">
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </Field>
          </div>
          <Button variant="secondary" className="mt-3" onClick={reset}>Limpar conversa</Button>
          {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
        </Card>
        <Card className="p-5">
          <h2 className="font-semibold">Mensagens rápidas</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {QUICK.map((qm) => (
              <button key={qm} onClick={() => send(qm)} disabled={busy} className="rounded-full border border-slate-200 px-3 py-1 text-xs hover:border-brand-300 hover:bg-brand-50 cursor-pointer">
                {qm}
              </button>
            ))}
          </div>
          <p className="mt-4 text-xs text-slate-500">
            Dica: as conversas do simulador também aparecem em <strong>Conversas</strong>, e os agendamentos entram na <strong>Agenda</strong>.
          </p>
        </Card>
      </div>
    </div>
  );
}
