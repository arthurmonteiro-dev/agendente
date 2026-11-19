import Link from "next/link";
import { LegalPage, legalInfo } from "@/components/LegalPage";

export const metadata = { title: "Termos de uso" };

export default function TermosPage() {
  const { company, email } = legalInfo();
  return (
    <LegalPage title="Termos de uso">
      <p>
        Estes Termos regulam o uso do <strong>Agendente</strong>, serviço on-line de agenda e atendimento por WhatsApp
        para clínicas odontológicas, oferecido por <strong>{company}</strong> (&quot;nós&quot;). Ao criar uma conta, a
        clínica (&quot;você&quot;) declara que leu e concorda com estes Termos e com a{" "}
        <Link href="/privacidade" className="text-brand-700 underline">Política de privacidade</Link>.
      </p>

      <h2>1. O serviço</h2>
      <p>
        O Agendente permite que a clínica organize a agenda, converse com pacientes pelo WhatsApp com apoio de um robô
        (por menu ou por inteligência artificial) e envie lembretes automáticos. O serviço é fornecido &quot;como
        está&quot;, em constante evolução, e funções podem ser alteradas ou incluídas.
      </p>

      <h2>2. Conta e acesso</h2>
      <ul>
        <li>Você é responsável pelas pessoas da sua equipe que cadastrar e pelo sigilo das senhas.</li>
        <li>Avise-nos imediatamente em caso de suspeita de uso indevido da conta.</li>
        <li>As informações cadastradas (clínica, profissionais, horários, preços) devem ser verdadeiras.</li>
      </ul>

      <h2>3. Uso do WhatsApp</h2>
      <ul>
        <li>
          A conexão com o WhatsApp é feita com a conta e o número da própria clínica. Você deve cumprir as políticas
          do WhatsApp e da Meta, inclusive enviar mensagens apenas a pacientes que forneceram o número à clínica.
        </li>
        <li>
          Custos cobrados pela Meta pelo uso da API oficial do WhatsApp são de responsabilidade da clínica e pagos
          diretamente a ela, salvo acordo diferente por escrito.
        </li>
        <li>
          A Evolution API e outras integrações não oficiais podem levar ao bloqueio do número pela Meta. Se você
          escolher esse modo, assume esse risco.
        </li>
      </ul>

      <h2>4. Assistente automático e inteligência artificial</h2>
      <ul>
        <li>
          O assistente agenda, confirma, remarca e cancela consultas e responde dúvidas gerais com base nas informações
          cadastradas pela clínica. <strong>Ele não faz diagnóstico, não prescreve tratamentos e não substitui o
          atendimento de um profissional de saúde.</strong>
        </li>
        <li>
          Respostas automáticas podem conter erros. A clínica deve acompanhar as conversas pela caixa de entrada e
          pode assumir o atendimento a qualquer momento.
        </li>
        <li>Situações de urgência são encaminhadas à equipe da clínica, que é responsável pelo atendimento.</li>
      </ul>

      <h2>5. Planos, pagamento e cancelamento</h2>
      <ul>
        <li>Novas contas têm um período de teste gratuito. Ao fim dele, o uso continua mediante assinatura de um plano.</li>
        <li>Os valores e limites de cada plano estão na página de preços e podem ser reajustados com aviso prévio de 30 dias.</li>
        <li>
          Você pode cancelar a qualquer momento, sem multa. O acesso segue até o fim do período já pago. Taxas de
          implantação, quando houver, não são reembolsáveis após a configuração concluída.
        </li>
        <li>A falta de pagamento por mais de 15 dias pode levar à suspensão da conta, após aviso.</li>
      </ul>

      <h2>6. Dados dos pacientes</h2>
      <p>
        Em relação aos dados dos pacientes, <strong>a clínica é a controladora</strong> e nós atuamos como{" "}
        <strong>operador</strong>, tratando esses dados apenas para prestar o serviço e conforme as instruções da
        clínica, nos termos da Lei Geral de Proteção de Dados (Lei 13.709/2018). Os detalhes estão na{" "}
        <Link href="/privacidade" className="text-brand-700 underline">Política de privacidade</Link>.
      </p>

      <h2>7. Responsabilidades</h2>
      <ul>
        <li>Empregamos medidas técnicas razoáveis para manter o serviço disponível e seguro, mas não garantimos funcionamento ininterrupto.</li>
        <li>
          Não respondemos por indisponibilidade do WhatsApp, da Meta ou de outros serviços de terceiros, nem por
          decisões clínicas ou comerciais tomadas pela clínica.
        </li>
        <li>
          Nossa responsabilidade total, em qualquer caso, fica limitada ao valor pago pela clínica nos 12 meses
          anteriores ao fato.
        </li>
      </ul>

      <h2>8. Encerramento da conta</h2>
      <p>
        Ao encerrar a conta, você pode pedir a exportação dos dados em até 30 dias. Depois desse prazo, os dados são
        excluídos, exceto o que a lei obrigar a guardar.
      </p>

      <h2>9. Alterações e foro</h2>
      <p>
        Podemos atualizar estes Termos; mudanças relevantes serão avisadas por e-mail ou no painel com antecedência.
        Fica eleito o foro do domicílio da clínica para resolver questões relacionadas a estes Termos.
      </p>

      <h2>10. Contato</h2>
      <p>Dúvidas sobre estes Termos: <a href={`mailto:${email}`} className="text-brand-700 underline">{email}</a>.</p>
    </LegalPage>
  );
}
