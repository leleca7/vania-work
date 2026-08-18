import { json } from './_lib/http.js';

export default async function handler(req, res) {
  const url = process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || '';
  json(res, 200, {
    configured: Boolean(url && key),
    supabaseUrl: url,
    supabasePublishableKey: key,
    aiConfigured: Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN),
    model: process.env.AI_MODEL || 'openai/gpt-5.6-sol'
  });
}
