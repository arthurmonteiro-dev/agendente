import { requireUser } from "@/lib/auth";
import { aiConfigured } from "@/lib/bot/context";
import { PageHeader } from "@/components/ui";
import { SimulatorClient } from "./SimulatorClient";

export const metadata = { title: "Simulador" };

export default async function SimuladorPage() {
  const user = await requireUser();
  const mode = user.clinic.botMode === "AI" && aiConfigured() ? "Assistente com IA (Claude)" : "Robô de menu";
  return (
    <>
      <PageHeader
        title="Simulador de WhatsApp"
        description="Converse com o seu robô como se fosse um paciente. Nada é enviado para o WhatsApp real."
      />
      <SimulatorClient clinicName={user.clinic.name} modeLabel={mode} botEnabled={user.clinic.botEnabled} />
    </>
  );
}
