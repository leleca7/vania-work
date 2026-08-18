import { requireUser } from '../_lib/supabase.js';
import { assistantReply, model } from '../_lib/ai.js';
import { body, json, method } from '../_lib/http.js';

export default async function handler(req, res) {
  if (!method(req, res, ['POST'])) return;
  try {
    const { supabase, user } = await requireUser(req);
    const input = await body(req);
    const question = String(input.question || '').trim();
    if (!question) return json(res, 400, { error: 'Pergunta vazia.' });

    const [{ data: prefs }, { data: opportunities }, { data: earnings }] = await Promise.all([
      supabase.from('user_preferences').select('*').eq('user_id', user.id).maybeSingle(),
      supabase.from('opportunities').select('platform,title,status,ai_score,ai_summary,ai_action,currency,pay_min,pay_max,estimated_minutes').in('status',['new','saved','applied','selected','in_progress']).order('ai_score',{ascending:false,nullsFirst:false}).limit(8),
      supabase.from('earnings').select('amount_usd,status,earned_at').order('earned_at',{ascending:false}).limit(30)
    ]);

    const paid = (earnings || []).filter(e => e.status === 'paid' || e.status === 'confirmed').reduce((s,e)=>s+Number(e.amount_usd || 0),0);
    const context = { preferences: prefs || {}, opportunities: opportunities || [], confirmed_usd: paid };
    const answer = await assistantReply(question, context);
    await supabase.from('ai_events').insert({ user_id: user.id, event_type: 'assistant', model, payload: { question, answer } });
    json(res, 200, { answer });
  } catch (error) {
    json(res, error.status || 500, { error: error.message || 'Falha no assistente.' });
  }
}
