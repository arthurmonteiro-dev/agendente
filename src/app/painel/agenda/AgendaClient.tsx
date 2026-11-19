"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { AppointmentSource, AppointmentStatus } from "@prisma/client";
import { Badge, Button, Card, Field, Input, Select, Textarea, cn } from "@/components/ui";
import { STATUS_LABEL, STATUS_STYLE } from "@/lib/format";

export interface AgendaAppointment {
  id: string;
  day: string;
  startMin: number;
  endMin: number;
  startISO: string;
  timeLabel: string;
  dateLabel: string;
  status: AppointmentStatus;
  source: AppointmentSource;
  notes: string | null;
  rating: number | null;
  patientName: string;
  patientPhone: string;
  patientId: string;
  conversationId: string | null;
  procedureName: string;
  dentistName: string;
  color: string;
}
export interface AgendaBlock {
  id: string;
  day: string;
  startMin: number;
  endMin: number;
  label: string;
}
interface Props {
  weekStart: string;
  prevWeek: string;
  nextWeek: string;
  weekLabel: string;
  days: { iso: string; label: string; date: string; isToday: boolean }[];
  gridStart: number;
  gridEnd: number;
  appointments: AgendaAppointment[];
  blocks: AgendaBlock[];
  dentists: { id: string; name: string; color: string }[];
  procedures: { id: string; name: string; durationMin: number; dentistIds: string[] }[];
  dentistFilter: string | null;
  tz: string;
}

const SLOT = 30; // minutos por linha
const ROW_H = 44; // px por linha
const SOURCE_LABEL: Record<AppointmentSource, string> = { BOT: "Robô (menu)", AI: "Assistente IA", STAFF: "Equipe" };

function hm(min: number) {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

/** Distribui consultas sobrepostas em colunas lado a lado. */
function layoutLanes(items: AgendaAppointment[]) {
  const sorted = [...items].sort((a, b) => a.startMin - b.startMin);
  const out: { a: AgendaAppointment; lane: number; lanes: number }[] = [];
  let group: { a: AgendaAppointment; lane: number }[] = [];
  let groupEnd = -1;
  const flush = () => {
    const lanes = Math.max(1, ...group.map((g) => g.lane + 1));
    group.forEach((g) => out.push({ ...g, lanes }));
    group = [];
  };
  for (const a of sorted) {
    if (a.startMin >= groupEnd && group.length) flush();
    const used = new Set(group.filter((g) => g.a.endMin > a.startMin).map((g) => g.lane));
    let lane = 0;
    while (used.has(lane)) lane++;
    group.push({ a, lane });
    groupEnd = Math.max(groupEnd, a.endMin);
  }
  if (group.length) flush();
  return out;
}

export function AgendaClient(p: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<AgendaAppointment | null>(null);
  const [creating, setCreating] = useState<{ day: string; time?: string } | null>(null);
  const rows = (p.gridEnd - p.gridStart) / SLOT;
  const [nowMin, setNowMin] = useState<{ day: string; min: number } | null>(null);

  useEffect(() => {
    const update = () => {
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: p.tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
      }).formatToParts(new Date());
      const get = (t: string) => parts.find((x) => x.type === t)?.value ?? "00";
      setNowMin({ day: `${get("year")}-${get("month")}-${get("day")}`, min: Number(get("hour")) * 60 + Number(get("minute")) });
    };
    update();
    const t = setInterval(update, 60_000);
    return () => clearInterval(t);
  }, [p.tz]);

  const byDay = useMemo(() => {
    const m = new Map<string, AgendaAppointment[]>();
    for (const a of p.appointments) m.set(a.day, [...(m.get(a.day) ?? []), a]);
    return m;
  }, [p.appointments]);

  const q = (semana: string) => `/painel/agenda?semana=${semana}${p.dentistFilter ? `&dentista=${p.dentistFilter}` : ""}`;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Agenda</h1>
          <p className="text-sm text-slate-500">Semana de {p.weekLabel}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-52">
          <Select
            value={p.dentistFilter ?? ""}
            onChange={(e) =>
              router.push(`/painel/agenda?semana=${p.weekStart}${e.target.value ? `&dentista=${e.target.value}` : ""}`)
            }
          >
            <option value="">Todos os profissionais</option>
            {p.dentists.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
          </div>
          <Link href={q(p.prevWeek)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50">
            ←
          </Link>
          <Link href={`/painel/agenda${p.dentistFilter ? `?dentista=${p.dentistFilter}` : ""}`} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50">
            Hoje
          </Link>
          <Link href={q(p.nextWeek)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50">
            →
          </Link>
          <Button onClick={() => setCreating({ day: p.days.find((d) => d.isToday)?.iso ?? p.days[0].iso })}>+ Nova consulta</Button>
        </div>
      </div>

      <Card className="overflow-x-auto">
        <div className="min-w-[760px]">
          <div className="grid border-b border-slate-200" style={{ gridTemplateColumns: `56px repeat(${p.days.length}, 1fr)` }}>
            <div />
            {p.days.map((d) => (
              <div key={d.iso} className={cn("px-2 py-2 text-center text-sm", d.isToday && "text-brand-700")}>
                <span className="capitalize">{d.label}</span>{" "}
                <span className={cn("font-semibold", d.isToday && "rounded-full bg-brand-600 px-2 py-0.5 text-white")}>{d.date}</span>
              </div>
            ))}
          </div>
          <div className="grid" style={{ gridTemplateColumns: `56px repeat(${p.days.length}, 1fr)` }}>
            <div className="relative" style={{ height: rows * ROW_H }}>
              {Array.from({ length: rows }, (_, i) =>
                i % 2 === 0 ? (
                  <span key={i} className="absolute right-2 -translate-y-2 text-[11px] text-slate-400" style={{ top: i * ROW_H }}>
                    {hm(p.gridStart + i * SLOT)}
                  </span>
                ) : null,
              )}
            </div>
            {p.days.map((d) => (
              <div key={d.iso} className={cn("relative border-l border-slate-100", d.isToday && "bg-brand-50/30")} style={{ height: rows * ROW_H }}>
                {Array.from({ length: rows }, (_, i) => (
                  <button
                    key={i}
                    title={`Agendar ${hm(p.gridStart + i * SLOT)}`}
                    onClick={() => setCreating({ day: d.iso, time: hm(p.gridStart + i * SLOT) })}
                    className={cn(
                      "absolute inset-x-0 cursor-pointer hover:bg-brand-50",
                      i % 2 === 0 ? "border-t border-slate-100" : "border-t border-dashed border-slate-100",
                    )}
                    style={{ top: i * ROW_H, height: ROW_H }}
                  />
                ))}
                {p.blocks
                  .filter((b) => b.day === d.iso)
                  .map((b) => (
                    <div
                      key={b.id}
                      className="pointer-events-none absolute inset-x-0.5 rounded bg-[repeating-linear-gradient(45deg,#f1f5f9,#f1f5f9_6px,#e2e8f0_6px,#e2e8f0_12px)] p-1 text-[11px] text-slate-500"
                      style={{ top: ((b.startMin - p.gridStart) / SLOT) * ROW_H, height: ((b.endMin - b.startMin) / SLOT) * ROW_H }}
                    >
                      {b.label}
                    </div>
                  ))}
                {layoutLanes(byDay.get(d.iso) ?? []).map(({ a, lane, lanes }) => (
                  <button
                    key={a.id}
                    onClick={() => setSelected(a)}
                    className={cn(
                      "absolute overflow-hidden rounded-md border-l-4 px-1.5 py-1 text-left text-[11px] leading-tight shadow-sm transition hover:z-10 hover:shadow-md cursor-pointer",
                      a.status === "NO_SHOW" ? "bg-rose-50" : a.status === "COMPLETED" ? "bg-sky-50" : "bg-white",
                      a.status === "SCHEDULED" && "ring-1 ring-amber-300",
                    )}
                    style={{
                      top: ((a.startMin - p.gridStart) / SLOT) * ROW_H + 1,
                      height: Math.max(((a.endMin - a.startMin) / SLOT) * ROW_H - 2, 20),
                      left: `calc(${(lane / lanes) * 100}% + 2px)`,
                      width: `calc(${100 / lanes}% - 4px)`,
                      borderLeftColor: a.color,
                    }}
                  >
                    <span className="block truncate font-semibold text-slate-800">
                      {a.status === "CONFIRMED" ? "✓ " : a.status === "SCHEDULED" ? "⏳ " : ""}
                      {a.patientName}
                    </span>
                    <span className="block truncate text-slate-500">
                      {a.timeLabel} · {a.procedureName}
                    </span>
                  </button>
                ))}
                {nowMin?.day === d.iso && nowMin.min >= p.gridStart && nowMin.min <= p.gridEnd && (
                  <div className="pointer-events-none absolute inset-x-0 z-20 border-t-2 border-rose-500" style={{ top: ((nowMin.min - p.gridStart) / SLOT) * ROW_H }} />
                )}
              </div>
            ))}
          </div>
        </div>
      </Card>
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500">
        <span>⏳ aguardando confirmação</span>
        <span>✓ confirmada</span>
        {p.dentists.map((d) => (
          <span key={d.id} className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: d.color }} /> {d.name}
          </span>
        ))}
      </div>

      {selected && <AppointmentModal a={selected} onClose={() => setSelected(null)} onChanged={() => { setSelected(null); router.refresh(); }} />}
      {creating && (
        <NewAppointmentModal
          initial={creating}
          dentists={p.dentists}
          procedures={p.procedures}
          defaultDentist={p.dentistFilter}
          onClose={() => setCreating(null)}
          onCreated={() => { setCreating(null); router.refresh(); }}
        />
      )}
    </>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 pt-[8vh]" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100 cursor-pointer" aria-label="Fechar">✕</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function AppointmentModal({ a, onClose, onChanged }: { a: AgendaAppointment; onClose: () => void; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState(a.notes ?? "");
  async function patch(body: object) {
    setBusy(true);
    const res = await fetch(`/api/appointments/${a.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false);
    if (res.ok) onChanged();
    else alert("Não foi possível atualizar a consulta.");
  }
  return (
    <Modal title="Consulta" onClose={onClose}>
      <div className="space-y-1 text-sm">
        <p className="text-lg font-semibold">{a.patientName}</p>
        <p className="text-slate-500">{a.patientPhone}</p>
        <p className="pt-2">🦷 {a.procedureName}</p>
        <p>👩‍⚕️ {a.dentistName}</p>
        <p className="capitalize">📅 {a.dateLabel} · {a.timeLabel}</p>
        <div className="flex flex-wrap gap-2 pt-2">
          <Badge className={STATUS_STYLE[a.status]}>{STATUS_LABEL[a.status]}</Badge>
          <Badge className="border-slate-200 bg-slate-50 text-slate-600">Origem: {SOURCE_LABEL[a.source]}</Badge>
          {a.rating && <Badge className="border-violet-200 bg-violet-50 text-violet-700">Avaliação: {a.rating}/5</Badge>}
        </div>
      </div>
      <div className="mt-4">
        <Field label="Observações">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-16" />
        </Field>
        {notes !== (a.notes ?? "") && (
          <Button size="sm" variant="secondary" className="mt-2" disabled={busy} onClick={() => patch({ notes })}>Salvar observação</Button>
        )}
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        {a.status !== "CONFIRMED" && <Button size="sm" disabled={busy} onClick={() => patch({ status: "CONFIRMED" })}>Confirmar</Button>}
        {a.status !== "COMPLETED" && <Button size="sm" variant="secondary" disabled={busy} onClick={() => patch({ status: "COMPLETED" })}>Atendido</Button>}
        {a.status !== "NO_SHOW" && <Button size="sm" variant="secondary" disabled={busy} onClick={() => patch({ status: "NO_SHOW" })}>Faltou</Button>}
        <Button size="sm" variant="danger" disabled={busy} onClick={() => confirm("Cancelar esta consulta?") && patch({ status: "CANCELED" })}>Cancelar</Button>
      </div>
      <div className="mt-4 flex gap-4 border-t border-slate-100 pt-4 text-sm">
        {a.conversationId && <Link className="text-brand-700 hover:underline" href={`/painel/conversas?c=${a.conversationId}`}>Abrir conversa</Link>}
        <Link className="text-brand-700 hover:underline" href={`/painel/pacientes/${a.patientId}`}>Ficha do paciente</Link>
      </div>
    </Modal>
  );
}

function NewAppointmentModal({
  initial, dentists, procedures, defaultDentist, onClose, onCreated,
}: {
  initial: { day: string; time?: string };
  dentists: Props["dentists"];
  procedures: Props["procedures"];
  defaultDentist: string | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ id: string; name: string | null; phone: string }[]>([]);
  const [patient, setPatient] = useState<{ id: string; label: string } | null>(null);
  const [newPatient, setNewPatient] = useState(false);
  const [np, setNp] = useState({ name: "", phone: "" });
  const [procedureId, setProcedureId] = useState(procedures[0]?.id ?? "");
  const [dentistId, setDentistId] = useState(defaultDentist ?? "");
  const [day, setDay] = useState(initial.day);
  const [slots, setSlots] = useState<{ start: string; dentistId: string; label: string }[]>([]);
  const [slot, setSlot] = useState<string>("");
  const [manualTime, setManualTime] = useState(initial.time ?? "");
  const [mode, setMode] = useState<"slot" | "manual">(initial.time ? "manual" : "slot");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const proc = procedures.find((x) => x.id === procedureId);
  const allowedDentists = dentists.filter((d) => proc?.dentistIds.includes(d.id));

  useEffect(() => {
    if (query.trim().length < 2) return setResults([]);
    const t = setTimeout(async () => {
      const res = await fetch(`/api/patients?q=${encodeURIComponent(query)}`);
      if (res.ok) setResults((await res.json()).patients);
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (!procedureId || !day) return;
    const ctrl = new AbortController();
    fetch(`/api/slots?procedureId=${procedureId}&day=${day}${dentistId ? `&dentistId=${dentistId}` : ""}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((j) => {
        setSlots(j.slots ?? []);
        const match = (j.slots ?? []).find((s: { label: string }) => s.label === initial.time);
        if (match && initial.time && day === initial.day) {
          setSlot(match.start);
          setMode("slot");
        }
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, [procedureId, dentistId, day, initial.time, initial.day]);

  async function submit() {
    setError("");
    let start: string | undefined;
    let startLocal: { day: string; time: string } | undefined;
    let finalDentist = dentistId;
    if (mode === "slot") {
      const s = slots.find((x) => x.start === slot);
      if (!s) return setError("Escolha um horário.");
      start = s.start;
      finalDentist = s.dentistId;
    } else {
      if (!manualTime) return setError("Informe o horário do encaixe.");
      if (!dentistId) return setError("No encaixe, escolha o profissional.");
      // o servidor converte usando o fuso da clínica
      startLocal = { day, time: manualTime };
    }
    if (!patient && !newPatient) return setError("Selecione ou cadastre o paciente.");
    if (newPatient && (np.name.trim().length < 2 || np.phone.replace(/\D/g, "").length < 10)) return setError("Informe nome e telefone com DDD.");
    setBusy(true);
    const res = await fetch("/api/appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patientId: patient?.id,
        newPatient: newPatient ? np : undefined,
        procedureId,
        dentistId: finalDentist,
        start,
        startLocal,
        notes: notes || undefined,
        allowOutsideHours: mode === "manual",
      }),
    });
    setBusy(false);
    if (res.ok) onCreated();
    else setError((await res.json().catch(() => ({}))).error || "Erro ao agendar.");
  }

  return (
    <Modal title="Nova consulta" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700">Paciente</span>
            <button className="text-xs text-brand-700 hover:underline cursor-pointer" onClick={() => { setNewPatient(!newPatient); setPatient(null); }}>
              {newPatient ? "Buscar existente" : "+ Novo paciente"}
            </button>
          </div>
          {newPatient ? (
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Nome completo" value={np.name} onChange={(e) => setNp({ ...np, name: e.target.value })} />
              <Input placeholder="WhatsApp com DDD" value={np.phone} onChange={(e) => setNp({ ...np, phone: e.target.value })} />
            </div>
          ) : patient ? (
            <div className="flex items-center justify-between rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm">
              {patient.label}
              <button className="text-xs text-slate-500 cursor-pointer" onClick={() => setPatient(null)}>trocar</button>
            </div>
          ) : (
            <div className="relative">
              <Input placeholder="Buscar por nome ou telefone…" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
              {results.length > 0 && (
                <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                  {results.map((r) => (
                    <li key={r.id}>
                      <button
                        className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50 cursor-pointer"
                        onClick={() => { setPatient({ id: r.id, label: `${r.name || "Sem nome"} · ${r.phone}` }); setResults([]); setQuery(""); }}
                      >
                        {r.name || "Sem nome"} <span className="text-slate-400">· {r.phone}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Procedimento">
            <Select value={procedureId} onChange={(e) => { setProcedureId(e.target.value); setSlot(""); }}>
              {procedures.map((x) => <option key={x.id} value={x.id}>{x.name} ({x.durationMin} min)</option>)}
            </Select>
          </Field>
          <Field label="Profissional">
            <Select value={dentistId} onChange={(e) => { setDentistId(e.target.value); setSlot(""); }}>
              <option value="">Qualquer disponível</option>
              {(mode === "manual" ? dentists : allowedDentists).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Data">
            <Input type="date" value={day} onChange={(e) => { setDay(e.target.value); setSlot(""); }} />
          </Field>
          <Field label="Horário">
            <div className="flex gap-1 text-xs">
              <button className={cn("rounded px-2 py-1 cursor-pointer", mode === "slot" ? "bg-brand-100 text-brand-800" : "text-slate-500")} onClick={() => setMode("slot")}>Livres</button>
              <button className={cn("rounded px-2 py-1 cursor-pointer", mode === "manual" ? "bg-brand-100 text-brand-800" : "text-slate-500")} onClick={() => setMode("manual")}>Encaixe</button>
            </div>
          </Field>
        </div>
        {mode === "slot" ? (
          slots.length ? (
            <div className="flex flex-wrap gap-1.5">
              {slots.map((s) => (
                <button
                  key={s.start + s.dentistId}
                  onClick={() => setSlot(s.start)}
                  className={cn(
                    "rounded-md border px-2.5 py-1 text-sm cursor-pointer",
                    slot === s.start ? "border-brand-600 bg-brand-600 text-white" : "border-slate-200 hover:border-brand-300",
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">Sem horários livres nesse dia. Use “Encaixe” para marcar mesmo assim.</p>
          )
        ) : (
          <Input type="time" value={manualTime} onChange={(e) => setManualTime(e.target.value)} />
        )}
        <Field label="Observações (opcional)">
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} disabled={busy}>{busy ? "Agendando…" : "Agendar"}</Button>
        </div>
      </div>
    </Modal>
  );
}
