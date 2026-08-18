import { createClient } from '@supabase/supabase-js';

function env() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('Supabase não configurado.');
  return { url, key };
}

export function userClient(req) {
  const { url, key } = env();
  const auth = req.headers.authorization || '';
  return createClient(url, key, {
    global: { headers: auth ? { Authorization: auth } : {} },
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

export function adminClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase admin não configurado.');
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

export async function requireUser(req) {
  const supabase = userClient(req);
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) {
    const e = new Error('Não autenticado.');
    e.status = 401;
    throw e;
  }
  return { supabase, user: data.user };
}
