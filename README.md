# Agendente 🦷

SaaS de **agenda e atendimento automático no WhatsApp para clínicas odontológicas**.
O robô atende 24h, agenda consultas em horários realmente livres, confirma presença,
envia lembretes, faz pesquisa de satisfação e chama a recepção quando precisa.

![Agenda](docs/screenshots/agenda.png)

## O que já funciona

| Área | Recursos |
|---|---|
| **Atendimento no WhatsApp** | Robô de menu (sem custo de IA) **ou** assistente com IA (Claude) que conversa naturalmente · cadastro automático do paciente · agendar, confirmar, remarcar e cancelar · endereço/horários/pagamentos · transferência para humano |
| **Agenda** | Visão semanal por profissional · expediente por dia (manhã/tarde) · duração por procedimento · bloqueios e feriados · antecedência mínima · encaixe manual · proteção contra agendamento duplo (transação serializável) |
| **Automações** | Lembrete 24h com confirmação (1 = confirma, 2 = remarcar/cancelar) · lembrete 2h antes · pesquisa de satisfação pós-consulta (nota ≤ 3 vai para a equipe) · retorno de 6 meses (recall) · aniversário · opt-out com **SAIR** (LGPD) |
| **Caixa de conversas** | Inbox compartilhada em tempo real · equipe assume/devolve ao robô · robô volta sozinho após X horas sem resposta da equipe |
| **Simulador** | Teste o robô como se fosse um paciente, sem WhatsApp real |
| **SaaS** | Multi-clínica (cada clínica só vê os próprios dados) · cadastro com teste grátis de 14 dias · equipe com perfis · planos com limites · painel `/admin` do dono do SaaS com MRR estimado |
| **Integrações** | WhatsApp Cloud API oficial (webhook com verificação de assinatura) · Evolution API (não oficial) · Anthropic Claude |

| Conversas | Simulador |
|---|---|
| ![Conversas](docs/screenshots/conversas.png) | ![Simulador](docs/screenshots/simulador.png) |

## Destaques técnicos

- **Multi-tenant de verdade:** toda consulta ao banco é filtrada pela clínica do usuário logado; testes de ataque confirmam que uma clínica não acessa dados de outra trocando IDs na URL.
- **Agendamento sem conflito:** motor de disponibilidade como função pura (testável) + gravação em transação `SERIALIZABLE` com retentativa, impedindo dois pacientes no mesmo horário.
- **Agente de IA com ferramentas escopadas:** o Claude consulta e altera a agenda por *tool use*, mas as ferramentas recebem o paciente do servidor, nunca do modelo; *fallback* para o robô de menu se a API falhar.
- **Segurança:** sessões JWT invalidadas ao trocar a senha, tokens de integração criptografados (AES-256-GCM), webhooks com assinatura HMAC, limites de tentativa, proteção contra SSRF e cabeçalhos de segurança. Relatório em [`docs/SEGURANCA.md`](docs/SEGURANCA.md).
- **LGPD:** termos e política de privacidade com aceite registrado, opt-out por "SAIR", exclusão de paciente e histórico.

## Stack

- **Next.js 16** (App Router, Server Actions, `proxy.ts`) + React 19 + Tailwind CSS 4
- **PostgreSQL** + Prisma 6
- **Luxon** para fusos horários (padrão `America/Sao_Paulo`)
- **@anthropic-ai/sdk** — modelo `claude-opus-5-5` com uso de ferramentas e *fallback* no servidor
- **Vitest** — 45 testes (motor de agenda, fluxos completos do robô, automações, IA com cliente simulado, criptografia, limites de tentativa, proteção contra SSRF)

## Banco de dados

Qualquer PostgreSQL 16+ funciona. Em produção usamos o **Neon** (Postgres gerenciado, região São Paulo):
crie um projeto, copie a connection string para `DATABASE_URL` no `.env` e rode `npm run db:migrate`.

## Rodando localmente

Pré-requisitos: Node 20.9+ e PostgreSQL 16 (ou `docker compose up -d` para subir um Postgres local).

```bash
npm install
cp .env.example .env          # só se o .env não existir; preencha SESSION_SECRET (openssl rand -hex 32)
npm run db:migrate            # cria as tabelas (na Neon já estão criadas; o comando só confirma)
npm run db:seed               # (opcional) clínica demo: demo@agendente.com.br / demo12345
npm run dev                   # http://localhost:3000
npm run worker                # em outro terminal: lembretes e automações
```

Coloque `demo@agendente.com.br` em `ADMIN_EMAILS` para ver o `/admin`.

### Testes

```bash
createdb agendente_test   # ou use TEST_DATABASE_URL
DATABASE_URL=postgresql://agendente:agendente@localhost:5432/agendente_test npx prisma migrate deploy
npm test
```

## Conectando o WhatsApp

### Opção 1 — WhatsApp Cloud API (oficial, recomendada)

1. Crie um app em [developers.facebook.com](https://developers.facebook.com) com o produto **WhatsApp** e registre o número da clínica.
2. Em **WhatsApp › Configuração**, cadastre o webhook:
   - URL: `https://SEU_DOMINIO/api/webhooks/whatsapp`
   - Token de verificação: o valor de `WHATSAPP_VERIFY_TOKEN`
   - Assine o campo **messages**.
3. Copie o **App Secret** (Configurações › Básico) para `WHATSAPP_APP_SECRET`. Em produção, webhooks sem assinatura válida são recusados.
4. No painel do Agendente: **Configurações › WhatsApp** → provedor *Cloud API*, informe o *Phone Number ID* e um token permanente (usuário do sistema no Business Manager). Use "Enviar mensagem de teste".
5. **Templates:** mensagens iniciadas pela clínica (lembretes, recall) fora da janela de 24h precisam de templates aprovados pela Meta. Crie-os no WhatsApp Manager e informe o nome em **Configurações › Automações**. Parâmetros do corpo: `{{1}}` nome, `{{2}}` procedimento, `{{3}}` dentista, `{{4}}` dia, `{{5}}` hora.

> Um único app da Meta atende todas as clínicas: o webhook identifica a clínica pelo `phone_number_id`. Para onboarding self-service em escala, o próximo passo é o *Embedded Signup* da Meta (virar Tech Provider).

### Opção 2 — Evolution API (não oficial)

Sem template e sem custo por conversa, mas usa o WhatsApp Web: **há risco de bloqueio do número**.
Informe URL, instância e API key em **Configurações › WhatsApp** e configure na Evolution o webhook
`https://SEU_DOMINIO/api/webhooks/evolution/<segredo-da-clínica>` (mostrado no painel) com o evento `MESSAGES_UPSERT`.

## Assistente com IA

Defina `ANTHROPIC_API_KEY` e escolha **Configurações › Assistente › Assistente com IA**.

- A IA consulta a agenda real por ferramentas (`buscar_horarios`, `agendar_consulta`, `remarcar_consulta`, `cancelar_consulta`, `confirmar_presenca`, `transferir_para_humano`…). Não inventa horários.
- **Escopo por paciente:** as ferramentas só enxergam e alteram consultas do paciente da conversa (há teste cobrindo isso).
- Regras clínicas: não diagnostica nem indica medicamentos; em dor/urgência oferece o horário mais próximo e chama a equipe.
- *Fallback* no servidor da Anthropic (`fallbacks: "default"`) se o modelo recusar; recusa final → transfere para humano; erro de API → cai para o robô de menu.
- Prompt fixo da clínica com cache (`cache_control`) e contexto variável (data/hora, consultas do paciente) separado.
- Ajustes: `AI_MODEL` (padrão `claude-opus-5-5`) e `AI_EFFORT` (padrão `medium`).

## Automações (worker)

As automações rodam a cada minuto com `npm run worker`. Em ambiente serverless (ex.: Vercel),
agende uma chamada a cada 5 minutos para:

```
GET /api/cron/tick
Authorization: Bearer <CRON_SECRET>
```

Todas são idempotentes (cada envio grava um carimbo). Recall e aniversário só saem das 9h às 18h no fuso da clínica.

## Deploy

Qualquer host Node com PostgreSQL serve (Railway, Render, Fly.io, VPS com PM2):

```bash
npm ci && npm run db:migrate && npm run build
npm start          # app web
npm run worker     # processo separado para as automações
```

Variáveis obrigatórias em produção: `DATABASE_URL`, `SESSION_SECRET`, `APP_URL`, `CRON_SECRET`,
`WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET` (se usar a API oficial) e `ANTHROPIC_API_KEY` (se usar IA).

## Estrutura

```
prisma/schema.prisma            modelos (clínica, profissionais, procedimentos, pacientes, consultas, conversas…)
src/lib/scheduling/             motor de disponibilidade (função pura) + agendamento transacional
src/lib/bot/menu.ts             robô de menu (máquina de estados)
src/lib/bot/ai.ts, tools.ts     assistente Claude + ferramentas escopadas ao paciente
src/lib/whatsapp/               provedores (Cloud API, Evolution, simulador), entrada e saída de mensagens
src/lib/automations/            lembretes, pós-consulta, recall, aniversário
src/app/api/webhooks/           webhooks da Meta e da Evolution
src/app/painel/                 painel da clínica
src/app/admin/                  painel do dono do SaaS
scripts/worker.ts               processo das automações
tests/                          testes (Vitest + Postgres)
```

## Próximos passos sugeridos

- **Cobrança recorrente** (Stripe, Asaas ou Pagar.me): hoje os planos existem e limitam recursos, mas o botão "Assinar" abre um e-mail.
- **Embedded Signup da Meta** para a clínica conectar o número sozinha.
- Recuperação de senha por e-mail e convite de equipe por link.
- Mensagens de áudio: transcrição antes de passar ao robô (hoje chegam como "[áudio]").
- Fila distribuída (ex.: Postgres advisory locks ou Redis) se rodar várias instâncias do app — a ordem das mensagens por conversa é garantida por instância.
- Termos de uso, política de privacidade e DPA para LGPD; criptografar tokens do WhatsApp no banco.
- Sincronização com Google Agenda e integração com softwares odontológicos (Simples Dental, Clinicorp…).

## Licença

© Todos os direitos reservados. O código está publicado para fins de portfólio; uso, cópia ou redistribuição dependem de autorização.
