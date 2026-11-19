/**
 * Worker das automações (lembretes, confirmações, pós-consulta, retorno, aniversário).
 * Rode junto com o app: `npm run worker`. Alternativa serverless: chame GET /api/cron/tick.
 */
import { runAllAutomations } from "../src/lib/automations/run";
import { db } from "../src/lib/db";

const INTERVAL_MS = Number(process.env.WORKER_INTERVAL_MS || 60_000);
let running = false;
let stopping = false;

async function tick() {
  if (running) return;
  running = true;
  try {
    const results = await runAllAutomations();
    for (const [slug, r] of Object.entries(results)) {
      const total = r.reminder24h + r.reminder2h + r.followup + r.recall + r.birthday;
      if (total || r.errors) console.log(new Date().toISOString(), slug, JSON.stringify(r));
    }
  } catch (e) {
    console.error("[worker] erro", e);
  } finally {
    running = false;
  }
}

console.log(`[worker] iniciado — intervalo ${INTERVAL_MS / 1000}s`);
tick();
const timer = setInterval(tick, INTERVAL_MS);

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, async () => {
    if (stopping) return;
    stopping = true;
    clearInterval(timer);
    await db.$disconnect();
    process.exit(0);
  });
}
