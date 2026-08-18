import { requireUser } from '../_lib/supabase.js';
import { analyzeOpportunity, model } from '../_lib/ai.js';
import { body, json, method } from '../_lib/http.js';

export default async function handler(req, res) {
  if (!method(req, res, ['POST'])) return;
  try {
    const { supabase, user } = await requireUser(req);
    const input = await body(req);
    if (!input.opportunityId) return json(res, 400, { error: 'opportunityId é obrigatório.' });

    const [{ data: opportunity, error: oppErr }, { data: prefs }] = await Promise.all([
      supabase.from('opportunities').select('*').eq('id', input.opportunityId).single(),
      supabase.from('user_preferences').select('*').eq('user_id', user.id).maybeSingle()
    ]);
    if (oppErr || !opportunity) return json(res, 404, { error: 'Oportunidade não encontrada.' });

    const result = await analyzeOpportunity(opportunity, prefs || {});
    const update = {
      ai_score: result.score,
      ai_summary: result.summary,
      ai_reason: result.reason,
      ai_action: result.action,
      ai_risk: result.risk,
      ai_estimated_hourly_usd: result.estimated_hourly_usd,
      ai_last_analyzed_at: new Date().toISOString()
    };
    const { error: updateErr } = await supabase.from('opportunities').update(update).eq('id', opportunity.id);
    if (updateErr) throw updateErr;
    await supabase.from('ai_events').insert({ user_id: user.id, opportunity_id: opportunity.id, event_type: 'analysis', model, payload: result });
    json(res, 200, { analysis: result });
  } catch (error) {
    json(res, error.status || 500, { error: error.message || 'Falha ao analisar oportunidade.' });
  }
}
