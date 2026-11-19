import Link from "next/link";
import { Logo } from "@/components/ui";
import { PLANS } from "@/lib/plans";
import { formatMoney } from "@/lib/format";

const FEATURES = [
  { icon: "🗓️", title: "Agendamento 24h pelo WhatsApp", text: "O paciente escolhe procedimento, profissional, dia e horário. Só aparecem horários realmente livres." },
  { icon: "✅", title: "Confirmação automática", text: "Lembrete 24h antes com “1 para confirmar, 2 para remarcar”. A agenda se atualiza sozinha." },
  { icon: "📉", title: "Menos faltas", text: "Lembretes no dia, remarcação em dois toques e lista de quem não confirmou para a recepção ligar." },
  { icon: "🤖", title: "Assistente com IA", text: "Conversa natural: entende “tem horário pra limpeza sexta de manhã?” e agenda sem menus." },
  { icon: "🙋", title: "Equipe assume quando precisa", text: "Caixa de conversas compartilhada. Urgências e dúvidas clínicas vão direto para um humano." },
  { icon: "🔁", title: "Retorno e satisfação", text: "Convida pacientes para a revisão de 6 meses e mede a satisfação após cada consulta." },
];

const FAQ = [
  ["Preciso trocar meu número de WhatsApp?", "Não necessariamente. Você pode usar a API oficial da Meta com o número da clínica (migrando do app WhatsApp Business) ou conectar via Evolution API."],
  ["E se o paciente quiser falar com uma pessoa?", "Ele digita 4 (ou pede para falar com atendente) e a conversa aparece para a recepção. O robô fica em silêncio até a equipe devolver o atendimento."],
  ["A IA pode dar diagnóstico?", "Não. Ela é instruída a nunca diagnosticar ou indicar medicamentos. Em casos de dor ou urgência, oferece o horário mais próximo e chama a equipe."],
  ["Os dados dos pacientes estão seguros?", "Cada clínica só enxerga os próprios dados. Pacientes podem pedir para não receber mensagens (SAIR) e você pode excluir cadastros a pedido (LGPD)."],
];

function Chat() {
  const msgs: [boolean, string][] = [
    [true, "Oi, queria marcar uma limpeza"],
    [false, "Olá, Juliana! 👋 Tem preferência de profissional?\n\n*1* - Dra. Ana\n*2* - Dr. Bruno\n*3* - Sem preferência"],
    [true, "3"],
    [false, "Escolha o melhor dia:\n\n*1* - Terça-feira, 18/11\n*2* - Quarta-feira, 19/11\n*3* - Quinta-feira, 20/11"],
    [true, "1"],
    [false, "Pronto! Consulta agendada ✅\n\n🦷 Limpeza\n👩‍⚕️ Dra. Ana\n📅 Terça-feira, 18/11 às 14:30"],
  ];
  return (
    <div className="mx-auto w-full max-w-sm overflow-hidden rounded-[2rem] border-8 border-slate-900 bg-slate-900 shadow-2xl">
      <div className="flex items-center gap-3 bg-[#075e54] px-4 py-3 text-white">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20">🦷</div>
        <div>
          <p className="text-sm font-semibold">Clínica Sorriso</p>
          <p className="text-[11px] text-white/70">online</p>
        </div>
      </div>
      <div className="wa-bg space-y-2 p-3">
        {msgs.map(([mine, text], i) => (
          <div key={i} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
            <p className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-1.5 text-[13px] shadow-sm ${mine ? "bg-[#d9fdd3]" : "bg-white"}`}>
              {text.split(/(\*[^*]+\*)/g).map((p, j) => (p.startsWith("*") ? <strong key={j}>{p.slice(1, -1)}</strong> : p))}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <div className="bg-white">
      <header className="sticky top-0 z-20 border-b border-slate-100 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Logo className="text-lg" />
          <nav className="flex items-center gap-1 text-sm sm:gap-4">
            <a href="#recursos" className="hidden text-slate-600 hover:text-slate-900 sm:inline">Recursos</a>
            <a href="#precos" className="hidden text-slate-600 hover:text-slate-900 sm:inline">Preços</a>
            <Link href="/login" className="rounded-lg px-3 py-2 text-slate-700 hover:bg-slate-100">Entrar</Link>
            <Link href="/cadastro" className="rounded-lg bg-brand-600 px-3 py-2 font-medium text-white hover:bg-brand-700">Teste grátis</Link>
          </nav>
        </div>
      </header>

      <section className="bg-gradient-to-b from-brand-50 to-white">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 md:grid-cols-2 md:py-24">
          <div>
            <p className="mb-4 inline-block rounded-full bg-brand-100 px-3 py-1 text-xs font-semibold text-brand-800">Feito para clínicas odontológicas</p>
            <h1 className="text-4xl font-semibold leading-tight tracking-tight text-slate-900 md:text-5xl">
              Sua agenda cheia, <span className="text-brand-600">no piloto automático</span> pelo WhatsApp.
            </h1>
            <p className="mt-5 text-lg text-slate-600">
              O Agendente atende seus pacientes 24 horas, agenda consultas, confirma presença e reduz faltas — enquanto sua recepção cuida de quem está na clínica.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/cadastro" className="rounded-xl bg-brand-600 px-6 py-3 font-medium text-white shadow-sm hover:bg-brand-700">Começar teste de 14 dias</Link>
              <a href="#como-funciona" className="rounded-xl border border-slate-300 px-6 py-3 font-medium text-slate-700 hover:bg-slate-50">Como funciona</a>
            </div>
            <p className="mt-3 text-sm text-slate-500">Sem cartão de crédito. Configuração em 10 minutos.</p>
          </div>
          <Chat />
        </div>
      </section>

      <section id="recursos" className="mx-auto max-w-6xl px-4 py-20">
        <h2 className="text-center text-3xl font-semibold tracking-tight">Tudo o que a recepção faz no WhatsApp — automatizado</h2>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-2xl border border-slate-200 p-6">
              <p className="text-3xl">{f.icon}</p>
              <h3 className="mt-3 font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-slate-600">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="como-funciona" className="bg-slate-50 py-20">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center text-3xl font-semibold tracking-tight">Como funciona</h2>
          <ol className="mt-12 grid gap-6 md:grid-cols-3">
            {[
              ["Cadastre a agenda", "Profissionais, horários de atendimento e procedimentos com duração. Bloqueie feriados e férias."],
              ["Conecte o WhatsApp", "Use a API oficial da Meta ou a Evolution API. Teste tudo antes no simulador integrado."],
              ["Deixe o robô trabalhar", "Agendamentos caem direto na agenda. Lembretes e confirmações saem sozinhos."],
            ].map(([t, d], i) => (
              <li key={t} className="rounded-2xl bg-white p-6 shadow-sm">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold text-white">{i + 1}</span>
                <h3 className="mt-4 font-semibold">{t}</h3>
                <p className="mt-2 text-sm text-slate-600">{d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="precos" className="mx-auto max-w-6xl px-4 py-20">
        <h2 className="text-center text-3xl font-semibold tracking-tight">Planos simples, sem fidelidade</h2>
        <p className="mt-3 text-center text-slate-600">Uma falta evitada por semana já paga a assinatura.</p>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {PLANS.map((p, i) => (
            <div key={p.id} className={`rounded-2xl border p-6 ${i === 1 ? "border-brand-500 shadow-lg ring-4 ring-brand-50" : "border-slate-200"}`}>
              {i === 1 && <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-700">Mais escolhido</p>}
              <h3 className="text-lg font-semibold">{p.name}</h3>
              <p className="mt-2 text-3xl font-semibold">{formatMoney(p.priceCents)}<span className="text-base font-normal text-slate-500">/mês</span></p>
              <ul className="mt-6 space-y-2 text-sm text-slate-600">
                {p.highlights.map((h) => <li key={h}>✓ {h}</li>)}
              </ul>
              <Link href="/cadastro" className={`mt-8 block rounded-xl px-4 py-2.5 text-center font-medium ${i === 1 ? "bg-brand-600 text-white hover:bg-brand-700" : "border border-slate-300 hover:bg-slate-50"}`}>
                Testar grátis
              </Link>
            </div>
          ))}
        </div>
        <p className="mt-4 text-center text-xs text-slate-500">Conversas iniciadas pela clínica na API oficial da Meta são cobradas pela Meta à parte.</p>
      </section>

      <section className="bg-slate-50 py-20">
        <div className="mx-auto max-w-3xl px-4">
          <h2 className="text-center text-3xl font-semibold tracking-tight">Perguntas frequentes</h2>
          <div className="mt-10 space-y-3">
            {FAQ.map(([q, a]) => (
              <details key={q} className="rounded-xl border border-slate-200 bg-white p-5">
                <summary className="cursor-pointer font-medium">{q}</summary>
                <p className="mt-3 text-sm text-slate-600">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-brand-700 py-16 text-center text-white">
        <h2 className="text-3xl font-semibold tracking-tight">Pronto para parar de perder pacientes no WhatsApp?</h2>
        <Link href="/cadastro" className="mt-8 inline-block rounded-xl bg-white px-6 py-3 font-medium text-brand-800 hover:bg-brand-50">Criar conta grátis</Link>
      </section>

      <footer className="border-t border-slate-100 py-8 text-center text-sm text-slate-500">
        <p>© {new Date().getFullYear()} Agendente · Feito para dentistas brasileiros</p>
        <p className="mt-2 space-x-4">
          <Link href="/termos" className="hover:text-slate-800 hover:underline">Termos de uso</Link>
          <Link href="/privacidade" className="hover:text-slate-800 hover:underline">Política de privacidade</Link>
        </p>
      </footer>
    </div>
  );
}
