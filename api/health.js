import { json } from './_lib/http.js';
export default async function handler(req, res) {
  json(res, 200, {
    ok: true,
    databaseConfigured: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_PUBLISHABLE_KEY),
    aiConfigured: Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN),
    cronConfigured: Boolean(process.env.CRON_SECRET)
  });
}
