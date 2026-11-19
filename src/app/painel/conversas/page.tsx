import { requireUser } from "@/lib/auth";
import { InboxClient } from "./InboxClient";

export const metadata = { title: "Conversas" };

export default async function ConversasPage({ searchParams }: PageProps<"/painel/conversas">) {
  const user = await requireUser();
  const { c } = await searchParams;
  return <InboxClient initialId={typeof c === "string" ? c : null} tz={user.clinic.timezone} />;
}
