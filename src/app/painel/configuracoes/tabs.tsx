import type { Clinic } from "@prisma/client";
import { db } from "@/lib/db";
import { ActionForm } from "@/components/ActionForm";
import { Badge, Button, Card, Field, Input, Select, Textarea } from "@/components/ui";
import { formatMoney } from "@/lib/format";
import { formatDayTime } from "@/lib/tz";
import { aiConfigured } from "@/lib/bot/context";
import { getAutomationSettings, type AutomationSettings } from "@/lib/automations/settings";
import { currentPlan, PLANS } from "@/lib/plans";
import * as A from "./actions";

const WEEKDAYS = ["", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card className="mb-6 p-5">
      <h2 className="font-semibold">{title}</h2>
      {description && <p className="mb-4 mt-1 text-sm text-slate-500">{description}</p>}
      {!description && <div className="mb-4" />}
      {children}
    </Card>
  );
}

export function ClinicTab({ clinic }: { clinic: Clinic }) {
  return (
    <Section title="Dados da clínica" description="Usados pelo robô para responder pacientes (endereço, telefone, pagamentos).">
      <ActionForm action={A.saveClinic}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Nome da clínica"><Input name="name" defaultValue={clinic.name} required /></Field>
          <Field label="Telefone de contato"><Input name="phone" defaultValue={clinic.phone ?? ""} /></Field>
          <div className="sm:col-span-2">
            <Field label="Endereço completo"><Input name="address" defaultValue={clinic.address ?? ""} placeholder="Rua, número, bairro, cidade" /></Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Informações gerais" hint="Formas de pagamento, convênios, estacionamento, etc. O robô mostra esse texto aos pacientes.">
              <Textarea name="infoText" defaultValue={clinic.infoText ?? ""} />
            </Field>
          </div>
          <Field label="Fuso horário"><Input name="timezone" defaultValue={clinic.timezone} /></Field>
          <Field label="Intervalo da agenda (min)" hint="De quanto em quanto tempo os horários começam">
            <Input name="slotStepMin" type="number" min={5} max={120} defaultValue={clinic.slotStepMin} />
          </Field>
          <Field label="Antecedência mínima (horas)" hint="Pacientes não agendam pelo robô com menos antecedência que isso">
            <Input name="minNoticeHours" type="number" min={0} max={72} defaultValue={clinic.minNoticeHours} />
          </Field>
          <Field label="Agendar até (dias à frente)">
            <Input name="maxDaysAhead" type="number" min={7} max={365} defaultValue={clinic.maxDaysAhead} />
          </Field>
        </div>
      </ActionForm>
    </Section>
  );
}

export async function DentistsTab({ clinicId }: { clinicId: string }) {
  const [dentists, procedures] = await Promise.all([
    db.dentist.findMany({ where: { clinicId }, include: { workingHours: true, procedures: { select: { id: true } } }, orderBy: [{ active: "desc" }, { name: "asc" }] }),
    db.procedure.findMany({ where: { clinicId, active: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
  ]);
  type D = (typeof dentists)[number];
  const form = (d?: D) => {
    const hoursFor = (wd: number) => (d?.workingHours ?? []).filter((h) => h.weekday === wd).sort((a, b) => a.start.localeCompare(b.start));
    return (
      <ActionForm action={A.saveDentist} resetOnSuccess={!d}>
        {d && <input type="hidden" name="id" value={d.id} />}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <div className="sm:col-span-2"><Field label="Nome"><Input name="name" defaultValue={d?.name ?? ""} placeholder="Dra. Ana Souza" required /></Field></div>
          <Field label="Especialidade"><Input name="specialty" defaultValue={d?.specialty ?? ""} /></Field>
          <Field label="CRO"><Input name="cro" defaultValue={d?.cro ?? ""} /></Field>
          <Field label="Cor na agenda"><Input name="color" type="color" defaultValue={d?.color ?? "#0d9488"} className="h-10 p-1" /></Field>
          <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" name="active" defaultChecked={d ? d.active : true} /> Ativo</label>
        </div>
        <div className="mt-5 space-y-6">
          <div className="max-w-2xl overflow-x-auto">
            <p className="mb-2 text-sm font-medium text-slate-700">Expediente</p>
            <table className="w-full min-w-[520px] text-sm">
              <thead className="text-xs text-slate-500">
                <tr><th className="text-left font-normal">Dia</th><th className="font-normal">Manhã</th><th className="font-normal">Tarde</th></tr>
              </thead>
              <tbody>
                {[1, 2, 3, 4, 5, 6, 7].map((wd) => {
                  const h = hoursFor(wd);
                  return (
                    <tr key={wd}>
                      <td className="py-1 pr-2 text-slate-600">{WEEKDAYS[wd]}</td>
                      {[0, 1].map((i) => (
                        <td key={i} className="px-1 py-1">
                          <div className="flex items-center gap-1">
                            <Input type="time" name={`h${wd}_s${i + 1}`} defaultValue={h[i]?.start ?? ""} className="px-1.5 py-1" />
                            <span className="text-slate-400">–</span>
                            <Input type="time" name={`h${wd}_e${i + 1}`} defaultValue={h[i]?.end ?? ""} className="px-1.5 py-1" />
                          </div>
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-1 text-xs text-slate-500">Deixe em branco os períodos sem atendimento.</p>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">Procedimentos que realiza</p>
            <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {procedures.map((p) => (
                <label key={p.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="procedures" value={p.id} defaultChecked={d ? d.procedures.some((x) => x.id === p.id) : true} /> {p.name}
                </label>
              ))}
            </div>
          </div>
        </div>
      </ActionForm>
    );
  };
  return (
    <>
      {dentists.map((d) => (
        <Card key={d.id} className="mb-6 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-semibold">
              <span className="h-3 w-3 rounded-full" style={{ background: d.color }} /> {d.name}
              {!d.active && <Badge className="border-slate-200 bg-slate-100 text-slate-500">inativo</Badge>}
            </h2>
            <form action={A.deleteDentist}>
              <input type="hidden" name="id" value={d.id} />
              <Button size="sm" variant="ghost" className="text-rose-600">Remover</Button>
            </form>
          </div>
          {form(d)}
        </Card>
      ))}
      <Section title="Adicionar profissional">{form()}</Section>
    </>
  );
}

export async function ProceduresTab({ clinicId }: { clinicId: string }) {
  const procedures = await db.procedure.findMany({ where: { clinicId }, orderBy: [{ active: "desc" }, { sortOrder: "asc" }, { name: "asc" }] });
  type P = (typeof procedures)[number];
  const row = (p?: P) => (
    <ActionForm action={A.saveProcedure} submitLabel={p ? "Salvar" : "Adicionar"} resetOnSuccess={!p}>
      {p && <input type="hidden" name="id" value={p.id} />}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
        <div className="sm:col-span-4"><Field label="Nome"><Input name="name" defaultValue={p?.name ?? ""} required /></Field></div>
        <div className="sm:col-span-2"><Field label="Duração (min)"><Input name="durationMin" type="number" min={5} max={480} defaultValue={p?.durationMin ?? 30} /></Field></div>
        <div className="sm:col-span-2"><Field label="Valor (R$)" hint="Vazio = informar na avaliação"><Input name="price" defaultValue={p?.priceCents ? (p.priceCents / 100).toFixed(2).replace(".", ",") : ""} /></Field></div>
        <div className="sm:col-span-1"><Field label="Ordem"><Input name="sortOrder" type="number" defaultValue={p?.sortOrder ?? 0} /></Field></div>
        <label className="flex items-center gap-2 pt-6 text-sm sm:col-span-1"><input type="checkbox" name="active" defaultChecked={p ? p.active : true} /> Ativo</label>
        <div className="sm:col-span-12"><Field label="Descrição (o assistente usa para explicar)"><Input name="description" defaultValue={p?.description ?? ""} /></Field></div>
      </div>
    </ActionForm>
  );
  return (
    <>
      {procedures.map((p) => (
        <Card key={p.id} className="mb-4 p-5">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold">
              {p.name} {p.priceCents ? <span className="font-normal text-slate-500">· {formatMoney(p.priceCents)}</span> : null}
              {!p.active && <Badge className="ml-2 border-slate-200 bg-slate-100 text-slate-500">inativo</Badge>}
            </p>
            <form action={A.deleteProcedure}>
              <input type="hidden" name="id" value={p.id} />
              <Button size="sm" variant="ghost" className="text-rose-600">Remover</Button>
            </form>
          </div>
          {row(p)}
        </Card>
      ))}
      <Section title="Novo procedimento" description="Novos procedimentos são liberados para todos os profissionais ativos (ajuste em Profissionais).">
        {row()}
      </Section>
    </>
  );
}

export async function TimeOffTab({ clinic }: { clinic: Clinic }) {
  const [items, dentists] = await Promise.all([
    db.timeOff.findMany({ where: { clinicId: clinic.id, end: { gte: new Date() } }, include: { dentist: true }, orderBy: { start: "asc" } }),
    db.dentist.findMany({ where: { clinicId: clinic.id, active: true }, orderBy: { name: "asc" } }),
  ]);
  return (
    <>
      <Section title="Novo bloqueio" description="Feriados, férias, congressos ou horários reservados. O robô não oferece esses horários.">
        <ActionForm action={A.addTimeOff} submitLabel="Bloquear" resetOnSuccess>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <Field label="Quem">
              <Select name="dentistId" defaultValue="">
                <option value="">Clínica inteira</option>
                {dentists.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </Select>
            </Field>
            <Field label="Início"><Input type="datetime-local" name="start" required /></Field>
            <Field label="Fim"><Input type="datetime-local" name="end" required /></Field>
            <Field label="Motivo"><Input name="reason" placeholder="Feriado, férias…" /></Field>
          </div>
        </ActionForm>
      </Section>
      <Card>
        <h2 className="border-b border-slate-100 px-5 py-4 font-semibold">Próximos bloqueios</h2>
        {items.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-500">Nenhum bloqueio futuro.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
                <div>
                  <p className="font-medium">{t.reason || "Bloqueio"} · {t.dentist?.name ?? "Clínica inteira"}</p>
                  <p className="text-slate-500">{formatDayTime(t.start, clinic.timezone)} → {formatDayTime(t.end, clinic.timezone)}</p>
                </div>
                <form action={A.deleteTimeOff}>
                  <input type="hidden" name="id" value={t.id} />
                  <Button size="sm" variant="ghost" className="text-rose-600">Remover</Button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

export function WhatsAppTab({ clinic }: { clinic: Clinic }) {
  const appUrl = process.env.APP_URL || "https://seu-dominio.com.br";
  return (
    <>
      <Section title="Conexão com o WhatsApp">
        <ActionForm action={A.saveWhatsApp}>
          <Field label="Provedor">
            <Select name="waProvider" defaultValue={clinic.waProvider}>
              <option value="SIMULATOR">Somente simulador (teste)</option>
              <option value="CLOUD">WhatsApp Cloud API — oficial da Meta (recomendado)</option>
              <option value="EVOLUTION">Evolution API — não oficial</option>
            </Select>
          </Field>
          <div className="mt-5 grid gap-4 rounded-lg border border-slate-200 p-4 sm:grid-cols-2">
            <p className="text-sm font-semibold sm:col-span-2">WhatsApp Cloud API (Meta)</p>
            <Field label="Phone Number ID"><Input name="waPhoneNumberId" defaultValue={clinic.waPhoneNumberId ?? ""} /></Field>
            <Field label="WhatsApp Business Account ID"><Input name="waBusinessAccountId" defaultValue={clinic.waBusinessAccountId ?? ""} /></Field>
            <div className="sm:col-span-2">
              <Field label="Token de acesso permanente" hint={clinic.waAccessToken ? "Token salvo. Deixe vazio para manter." : "Gere um token de usuário do sistema no Business Manager."}>
                <Input name="waAccessToken" type="password" autoComplete="off" placeholder={clinic.waAccessToken ? "••••••••" : ""} />
              </Field>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600 sm:col-span-2">
              <p><strong>URL do webhook:</strong> <code>{appUrl}/api/webhooks/whatsapp</code></p>
              <p><strong>Token de verificação:</strong> valor da variável <code>WHATSAPP_VERIFY_TOKEN</code> · Assine o campo <code>messages</code>.</p>
              <p className="mt-1">Mensagens iniciadas pela clínica (lembretes) fora da janela de 24h exigem <strong>templates aprovados</strong> — configure-os em Automações.</p>
            </div>
          </div>
          <div className="mt-5 grid gap-4 rounded-lg border border-slate-200 p-4 sm:grid-cols-2">
            <p className="text-sm font-semibold sm:col-span-2">Evolution API</p>
            <Field label="URL do servidor"><Input name="evoBaseUrl" defaultValue={clinic.evoBaseUrl ?? ""} placeholder="https://evolution.seudominio.com" /></Field>
            <Field label="Nome da instância"><Input name="evoInstance" defaultValue={clinic.evoInstance ?? ""} /></Field>
            <div className="sm:col-span-2">
              <Field label="API key" hint={clinic.evoApiKey ? "Chave salva. Deixe vazio para manter." : undefined}>
                <Input name="evoApiKey" type="password" autoComplete="off" placeholder={clinic.evoApiKey ? "••••••••" : ""} />
              </Field>
            </div>
            <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800 sm:col-span-2">
              <p><strong>URL do webhook (evento MESSAGES_UPSERT):</strong> <code>{appUrl}/api/webhooks/evolution/{clinic.webhookSecret}</code></p>
              <p className="mt-1">A Evolution usa o WhatsApp Web (não oficial). Há risco de bloqueio do número pela Meta.</p>
            </div>
          </div>
        </ActionForm>
      </Section>
      <Section title="Enviar mensagem de teste">
        <ActionForm action={A.sendTestMessage} submitLabel="Enviar teste">
          <Field label="Seu número (com DDD)"><Input name="to" placeholder="(11) 99999-0000" className="max-w-xs" /></Field>
        </ActionForm>
      </Section>
    </>
  );
}

export function AssistantTab({ clinic }: { clinic: Clinic }) {
  const plan = currentPlan(clinic);
  return (
    <Section title="Assistente virtual">
      <ActionForm action={A.saveAssistant}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="botEnabled" defaultChecked={clinic.botEnabled} /> Robô ativo (responde automaticamente 24h)
          </label>
          <Field label="Modo de atendimento">
            <Select name="botMode" defaultValue={clinic.botMode}>
              <option value="MENU">Menu numerado (simples, sem custo de IA)</option>
              <option value="AI" disabled={!plan.ai}>Assistente com IA — conversa natural (Claude){plan.ai ? "" : " · plano Profissional"}</option>
            </Select>
          </Field>
          <Field label="Nome da assistente"><Input name="botName" defaultValue={clinic.botName} /></Field>
          <Field label="Devolver ao robô após (horas sem resposta da equipe)">
            <Input name="humanTimeoutHours" type="number" min={1} max={168} defaultValue={clinic.humanTimeoutHours} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Instruções extras para a IA" hint="Ex.: 'Não atendemos convênio X', 'Ofereça a promoção de clareamento de novembro', tom de voz…">
              <Textarea name="botInstructions" defaultValue={clinic.botInstructions ?? ""} />
            </Field>
          </div>
        </div>
        {clinic.botMode === "AI" && !aiConfigured() && (
          <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            A variável <code>ANTHROPIC_API_KEY</code> não está configurada no servidor — enquanto isso, o robô de menu responde.
          </p>
        )}
      </ActionForm>
    </Section>
  );
}

const AUTO_META: Record<keyof AutomationSettings, { title: string; desc: string }> = {
  reminder24h: { title: "Lembrete e confirmação (24h antes)", desc: "Pede confirmação. Resposta 1 confirma; 2 abre opções de remarcar/cancelar." },
  reminder2h: { title: "Lembrete no dia (2h antes)", desc: "Aviso curto com o endereço." },
  followup: { title: "Pesquisa de satisfação", desc: "Enviada 2h após consultas marcadas como 'Atendido'. Notas até 3 vão para a equipe." },
  recall: { title: "Retorno periódico (recall)", desc: "Convida pacientes sem consulta há X meses para revisão/limpeza." },
  birthday: { title: "Aniversário", desc: "Mensagem no dia do aniversário (precisa da data de nascimento)." },
};

export function AutomationsTab({ clinic }: { clinic: Clinic }) {
  const s = getAutomationSettings(clinic.automations);
  return (
    <ActionForm action={A.saveAutomations}>
      <p className="mb-4 text-sm text-slate-500">
        Variáveis: <code>{"{nome} {clinica} {procedimento} {dentista} {dia} {data} {hora} {endereco}"}</code>. Pacientes que respondem SAIR não recebem automações.
      </p>
      {(Object.keys(AUTO_META) as (keyof AutomationSettings)[]).map((k) => (
        <Card key={k} className="mb-4 p-5">
          <label className="flex items-center gap-2 font-semibold">
            <input type="checkbox" name={`${k}.enabled`} defaultChecked={s[k].enabled} /> {AUTO_META[k].title}
          </label>
          <p className="mb-3 mt-1 text-sm text-slate-500">{AUTO_META[k].desc}</p>
          <Textarea name={`${k}.text`} defaultValue={s[k].text} />
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Template da Meta (opcional)" hint="Nome do template aprovado. Parâmetros: {{1}} nome, {{2}} procedimento, {{3}} dentista, {{4}} dia, {{5}} hora.">
              <Input name={`${k}.waTemplate`} defaultValue={s[k].waTemplate ?? ""} placeholder="lembrete_consulta" />
            </Field>
            {k === "recall" && (
              <Field label="Meses desde a última consulta"><Input name="recall.months" type="number" min={1} max={24} defaultValue={s.recall.months} /></Field>
            )}
          </div>
        </Card>
      ))}
    </ActionForm>
  );
}

export function PasswordSection() {
  return (
    <Section title="Minha senha" description="Troque a senha de demonstração por uma só sua (mínimo 10 caracteres).">
      <ActionForm action={A.changePassword} submitLabel="Alterar senha" resetOnSuccess>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Senha atual"><Input name="current" type="password" autoComplete="current-password" required /></Field>
          <Field label="Nova senha"><Input name="next" type="password" autoComplete="new-password" minLength={10} required /></Field>
          <Field label="Confirmar nova senha"><Input name="confirm" type="password" autoComplete="new-password" minLength={10} required /></Field>
        </div>
      </ActionForm>
    </Section>
  );
}

export async function TeamTab({ clinicId, meId }: { clinicId: string; meId: string }) {
  const users = await db.user.findMany({ where: { clinicId }, orderBy: { createdAt: "asc" } });
  return (
    <>
      <PasswordSection />
      <Card className="mb-6">
        <ul className="divide-y divide-slate-100">
          {users.map((u) => (
            <li key={u.id} className="flex items-center justify-between px-5 py-3 text-sm">
              <div>
                <p className="font-medium">{u.name} {u.id === meId && <span className="text-slate-400">(você)</span>}</p>
                <p className="text-slate-500">{u.email}</p>
              </div>
              <div className="flex items-center gap-3">
                <Badge className="border-slate-200 bg-slate-50 text-slate-600">{u.role === "OWNER" ? "Responsável" : "Recepção"}</Badge>
                {u.id !== meId && (
                  <form action={A.removeStaff}>
                    <input type="hidden" name="id" value={u.id} />
                    <Button size="sm" variant="ghost" className="text-rose-600">Remover</Button>
                  </form>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Card>
      <Section title="Adicionar pessoa da equipe">
        <ActionForm action={A.addStaff} submitLabel="Adicionar" resetOnSuccess>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <Field label="Nome"><Input name="name" required /></Field>
            <Field label="E-mail"><Input name="email" type="email" required /></Field>
            <Field label="Senha inicial"><Input name="password" type="password" minLength={8} required /></Field>
            <Field label="Perfil">
              <Select name="role" defaultValue="STAFF">
                <option value="STAFF">Recepção</option>
                <option value="OWNER">Responsável</option>
              </Select>
            </Field>
          </div>
        </ActionForm>
      </Section>
    </>
  );
}

export function PlanTab({ clinic }: { clinic: Clinic }) {
  const plan = currentPlan(clinic);
  return (
    <>
      <Card className="mb-6 p-5">
        <p className="text-sm text-slate-500">Plano atual</p>
        <p className="text-xl font-semibold">{plan.name}</p>
        {clinic.plan === "trial" && clinic.trialEndsAt && (
          <p className="text-sm text-slate-500">Teste até {clinic.trialEndsAt.toLocaleDateString("pt-BR")} — todos os recursos liberados.</p>
        )}
      </Card>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {PLANS.map((p) => (
          <Card key={p.id} className={`p-5 ${clinic.plan === p.id ? "border-brand-500 ring-2 ring-brand-100" : ""}`}>
            <p className="font-semibold">{p.name}</p>
            <p className="mt-1 text-2xl font-semibold">{formatMoney(p.priceCents)}<span className="text-sm font-normal text-slate-500">/mês</span></p>
            <ul className="mt-3 space-y-1 text-sm text-slate-600">
              {p.highlights.map((h) => <li key={h}>✓ {h}</li>)}
            </ul>
            <a
              href={`mailto:${process.env.SALES_EMAIL || "contato@agendente.com.br"}?subject=Assinar plano ${p.name}`}
              className="mt-4 inline-block rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              {clinic.plan === p.id ? "Plano atual" : "Assinar"}
            </a>
          </Card>
        ))}
      </div>
      <p className="mt-4 text-xs text-slate-500">Cobrança recorrente (Stripe, Asaas, Pagar.me) ainda não está integrada — o botão abre um e-mail de contato.</p>
    </>
  );
}
