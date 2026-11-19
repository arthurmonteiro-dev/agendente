import Link from "next/link";
import { LegalPage, legalInfo } from "@/components/LegalPage";

export const metadata = { title: "Política de privacidade" };

export default function PrivacidadePage() {
  const { company, email } = legalInfo();
  return (
    <LegalPage title="Política de privacidade">
      <p>
        Esta Política explica como o <strong>Agendente</strong>, oferecido por <strong>{company}</strong>, trata dados
        pessoais, de acordo com a Lei Geral de Proteção de Dados (LGPD, Lei 13.709/2018).
      </p>

      <h2>1. Quem é quem</h2>
      <ul>
        <li>
          <strong>Dados dos usuários das clínicas</strong> (nome, e-mail e senha de quem acessa o painel): nós somos o{" "}
          <strong>controlador</strong>.
        </li>
        <li>
          <strong>Dados dos pacientes</strong> (nome, telefone, mensagens, consultas): a <strong>clínica</strong> é a
          controladora e nós somos o <strong>operador</strong>. Tratamos esses dados somente para prestar o serviço à
          clínica e conforme as instruções dela.
        </li>
      </ul>

      <h2>2. Quais dados tratamos</h2>
      <ul>
        <li>Da clínica e da equipe: nome, e-mail, telefone, senha (guardada de forma irreversível) e registros de acesso.</li>
        <li>
          Dos pacientes: nome, número de WhatsApp, data de nascimento (se informada), mensagens trocadas, consultas
          (data, profissional e procedimento) e avaliações de atendimento.
        </li>
      </ul>
      <p>
        Informações de agendamento odontológico podem revelar dados de saúde, que a LGPD considera{" "}
        <strong>dados sensíveis</strong>. Por isso, aplicamos cuidados reforçados de segurança e acesso.
      </p>

      <h2>3. Para que usamos</h2>
      <ul>
        <li>Agendar, confirmar, remarcar e cancelar consultas e responder pacientes em nome da clínica.</li>
        <li>Enviar lembretes, pesquisas de satisfação e convites de retorno configurados pela clínica.</li>
        <li>Manter o serviço seguro, prevenir fraudes e cumprir obrigações legais.</li>
      </ul>
      <p>Não vendemos dados pessoais e não os usamos para publicidade de terceiros.</p>

      <h2>4. Com quem compartilhamos</h2>
      <p>Somente com fornecedores necessários ao funcionamento do serviço, que também devem proteger os dados:</p>
      <ul>
        <li><strong>Neon</strong> — banco de dados, com servidores em São Paulo (Brasil).</li>
        <li><strong>Provedor de hospedagem</strong> do sistema.</li>
        <li><strong>Meta (WhatsApp)</strong> — envio e recebimento das mensagens.</li>
        <li>
          <strong>Anthropic</strong> — apenas se a clínica ativar o assistente com inteligência artificial; as
          mensagens da conversa são processadas para gerar respostas.
        </li>
      </ul>
      <p>
        Alguns desses fornecedores podem processar dados fora do Brasil. Nesses casos, a transferência internacional
        segue as hipóteses do art. 33 da LGPD, com cláusulas contratuais adequadas.
      </p>

      <h2>5. Por quanto tempo guardamos</h2>
      <p>
        Enquanto a conta da clínica estiver ativa. Após o encerramento, os dados podem ser exportados em até 30 dias
        e depois são excluídos, salvo obrigação legal de guarda. A clínica pode excluir um paciente e todo o histórico
        dele a qualquer momento pelo painel.
      </p>

      <h2>6. Segurança</h2>
      <ul>
        <li>Conexões criptografadas (HTTPS) e banco de dados com acesso restrito.</li>
        <li>Senhas guardadas com hash; tokens de integração do WhatsApp criptografados.</li>
        <li>Cada clínica acessa apenas os próprios dados; o assistente só age nas consultas do paciente da conversa.</li>
        <li>Limite de tentativas de login e registro das ações relevantes.</li>
      </ul>
      <p>
        Em caso de incidente de segurança que possa causar risco relevante, avisaremos as clínicas afetadas e, quando
        exigido, a Autoridade Nacional de Proteção de Dados (ANPD).
      </p>

      <h2>7. Direitos dos titulares</h2>
      <p>
        Pacientes podem pedir acesso, correção, exclusão ou informações sobre seus dados. Como a clínica é a
        controladora, <strong>esses pedidos devem ser feitos à clínica</strong>, e nós a apoiamos no atendimento.
        Pacientes também podem responder <strong>SAIR</strong> no WhatsApp para não receber mais mensagens
        automáticas.
      </p>
      <p>
        Usuários das clínicas podem exercer seus direitos diretamente conosco pelo e-mail abaixo.
      </p>

      <h2>8. Cookies</h2>
      <p>Usamos apenas um cookie essencial, para manter você conectado ao painel. Não usamos cookies de publicidade.</p>

      <h2>9. Contato e encarregado (DPO)</h2>
      <p>
        Encarregado pelo tratamento de dados pessoais: <a href={`mailto:${email}`} className="text-brand-700 underline">{email}</a>.
      </p>
      <p className="text-sm text-slate-500">
        Veja também os <Link href="/termos" className="underline">Termos de uso</Link>.
      </p>
    </LegalPage>
  );
}
