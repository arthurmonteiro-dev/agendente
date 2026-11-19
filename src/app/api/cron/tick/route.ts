import { NextResponse, type NextRequest } from "next/server";
import { runAllAutomations } from "@/lib/automations/run";

/** Disparo das automações. Chame a cada 5 minutos (Vercel Cron, cron do servidor, etc.). */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  // Segredo só no cabeçalho (URLs ficam gravadas em logs de servidores e proxies)
  if (!secret || auth !== `Bearer ${secret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const results = await runAllAutomations();
  return NextResponse.json({ ok: true, results });
}
