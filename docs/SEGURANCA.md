# Segurança do Agendente

## Já corrigido no código

| O quê | Por quê importa |
|---|---|
| **Tokens do WhatsApp criptografados no banco** (AES-256) | Se alguém copiar o banco, não consegue usar o número da clínica. |
| **Limite de tentativas de login** (10 a cada 15 min por e-mail/IP) | Impede robôs de ficarem chutando senhas. |
| **Troca de senha no painel** (Configurações → Equipe → Minha senha) | Para trocar a senha de demonstração. |
| **Senhas novas mais fortes** (mínimo 10 caracteres, hash bcrypt) | Senhas guardadas de forma que nem você consegue ler. |
| **Cabeçalhos de segurança no site** | O navegador bloqueia ataques comuns (site falso "embrulhando" o seu, etc.). |
| **Trava de produção** | O sistema se recusa a rodar na internet com a senha de sessão de teste. |
| **Webhook da Meta com assinatura obrigatória** (já existia) | Ninguém consegue se passar pela Meta para mandar mensagens falsas. |
| **Cada clínica só vê os próprios dados** (já existia) | Uma clínica nunca enxerga pacientes de outra. |
| **A IA só mexe nas consultas do paciente que está conversando** (já existia) | Ninguém consegue pedir à IA para cancelar a consulta de outra pessoa. |

## Auditoria de 19/11/2026 (testes de ataque reais)

Testado com o sistema rodando em modo produção e duas clínicas de teste: a "atacante" tentando
acessar dados da "vítima". Os testes ficam no projeto (`npm test`, 45 testes).

| Falha comum em sistemas feitos com IA | Resultado no Agendente |
|---|---|
| Chave da Anthropic/OpenAI no código do navegador | ✅ Não acontece. A chave só existe no servidor; o código público foi vasculhado e não contém nenhum segredo. |
| Banco aberto sem regras de acesso (ex.: Supabase sem RLS) | ✅ Não se aplica: o navegador nunca fala com o banco. Só o servidor acessa, com senha. **Confira:** no console da Neon, *Data API* deve estar desligada. |
| `.env` publicado junto com o site | ✅ `/.env`, `/package.json`, `/prisma/...` e afins dão 404. O `.env` também não vai mais nos zips. |
| Login só conferido no navegador | ✅ Toda página, rota e ação confere o login no servidor. Crachás falsificados (inclusive assinados com a senha antiga de teste) são recusados. |
| Trocar o número na URL e ver dados de outro cliente | ✅ Bloqueado em 10 tentativas diferentes (ler, editar, cancelar, agendar, buscar). **Corrigido:** 3 delas davam erro 500 ou "ok" falso; agora respondem 404. |
| Formulário sem limite (robô cria 10 mil contas) | ❌→✅ **Falha encontrada e corrigida.** Antes: 8 de 8 cadastros passavam. Agora: 3 por IP por hora, 30 por hora no total, e uma armadilha invisível para robôs. Login: 10 tentativas por e-mail e IP e 30 por e-mail a cada 15 min. |
| Painel de admin escondido mas não trancado | ✅ Trancado no servidor: quem não está em `ADMIN_EMAILS` recebe "página não encontrada", mesmo digitando o endereço. |

**Encontrado e corrigido na mesma auditoria:**
- Trocar a senha não desconectava outros aparelhos. Agora desconecta (testado com dois navegadores).
- Uma clínica podia cadastrar o número de WhatsApp de outra e receber as mensagens dela. Agora a Meta precisa confirmar que o token tem acesso ao número.
- O endereço da Evolution API podia apontar para a rede interna do servidor (SSRF). Agora só domínios públicos com https.
- O segredo do disparo de lembretes era aceito na URL (que fica em logs). Agora só no cabeçalho.
- O endereço secreto do webhook da Evolution agora é gerado com aleatoriedade criptográfica.

**Limites conhecidos (aceitáveis por enquanto):**
- Os limites de tentativas ficam na memória do servidor: se um dia rodar mais de uma cópia do sistema, cada cópia conta separado.
- A mensagem "já existe uma conta com esse e-mail" no cadastro revela que o e-mail está cadastrado (comum em SaaS pequeno).

## LGPD (dados de saúde)

Agenda com procedimento odontológico é **dado de saúde** (dado sensível pela LGPD). O sistema trata a clínica como controladora e o Agendente como operador:
- **Termos de uso** e **política de privacidade** no site.
- **Contrato com cada clínica** dizendo que ela é a "controladora" dos dados e você o "operador".
- Atender pedido de exclusão: já existe o botão "Excluir paciente e histórico" na ficha do paciente.
