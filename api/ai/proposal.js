import { requireUser } from '../_lib/supabase.js';
import { makeProposal, model } from '../_lib/ai.js';
import { body, json, method } from '../_lib/http.js';

export default async function handler(req, res) {
  if (!method(req, res, ['POST'])) return;
  try {
    const { supabase, user } = await requireUser(req);
    const input = await body(req);
    if (!input.opportunityId) return json(res, 400, { error: 'opportunityId é obrigatório.' });

    const [{ data: opportunity, error: oppErr }, { data: profile }] = await Promise.all([
      supabase.from('opportunities').select('*').eq('id', input.opportunityId).single(),
      supabase.from('profiles').select('display_name').eq('id', user.id).maybeSingle()
    ]);
    if (oppErr || !opportunity) return json(res, 404, { error: 'Oportunidade não encontrada.' });
    if (opportunity.automation_level === 'blocked') return json(res, 403, { error: 'A regra desta oportunidade bloqueia automação.' });

    const proposal = await makeProposal(opportunity, profile || {});
    await supabase.from('ai_events').insert({ user_id: user.id, opportunity_id: opportunity.id, event_type: 'proposal', model, payload: { proposal } });
    json(res, 200, { proposal });
  } catch (error) {
    json(res, error.status || 500, { error: error.message || 'Falha ao gerar proposta.' });
  }
}
