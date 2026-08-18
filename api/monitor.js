import { adminClient, requireUser } from './_lib/supabase.js';
import { analyzeOpportunity, model } from './_lib/ai.js';
import { body, json } from './_lib/http.js';

function hoursSince(iso) {
  if (!iso) return Infinity;
  return (Date.now() - new Date(iso).getTime()) / 36e5;
}

async function runForUser(supabase, userId, triggerType = 'scheduled', force = false) {
  const { data: prefs } = await supabase.from('user_preferences').select('*').eq('user_id', userId).maybeSingle();
  const cycle = prefs?.monitor_cycle_hours || 12;
  if (prefs && prefs.monitor_enabled === false) return { skipped: true, reason: 'monitor_disabled' };

  const { data: last } = await supabase.from('monitor_runs').select('started_at,status').eq('user_id', userId).eq('status','completed').order('started_at',{ascending:false}).limit(1).maybeSingle();
  if (!force && last && hoursSince(last.started_at) < cycle - 0.25) return { skipped: true, reason: 'cycle_not_due' };

  const { data: run, error: runErr } = await supabase.from('monitor_runs').insert({ user_id: userId, cycle_hours: cycle, trigger_type: triggerType, status: 'running' }).select('*').single();
  if (runErr) throw runErr;

  try {
    const { data: opportunities, error } = await supabase.from('opportunities')
      .select('*').eq('user_id', userId).in('status',['new','saved','applied','selected'])
      .order('created_at',{ascending:false}).limit(20);
    if (error) throw error;

    const analyzed = [];
    for (const opportunity of opportunities || []) {
      const stale = !opportunity.ai_last_analyzed_at || hoursSince(opportunity.ai_last_analyzed_at) >= cycle || opportunity.ai_score == null;
      if (!stale) { analyzed.push(opportunity); continue; }
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
      await supabase.from('opportunities').update(update).eq('id', opportunity.id);
      await supabase.from('ai_events').insert({ user_id: userId, opportunity_id: opportunity.id, event_type: 'monitor', model, payload: result });
      analyzed.push({ ...opportunity, ...update });
    }

    const ranked = analyzed
      .filter(o => (o.ai_score ?? 0) >= 70)
      .sort((a,b) => (b.ai_score ?? 0) - (a.ai_score ?? 0))
      .slice(0, 6);

    const briefing = {
      headline: ranked.length ? `${ranked.length} oportunidades merecem atenção` : 'Nenhuma prioridade forte neste ciclo',
      best: ranked[0] ? { id: ranked[0].id, title: ranked[0].title, platform: ranked[0].platform, score: ranked[0].ai_score, action: ranked[0].ai_action } : null,
      recommended_ids: ranked.map(x=>x.id),
      generated_at: new Date().toISOString()
    };

    await supabase.from('monitor_runs').update({
      status:'completed', total_found:(opportunities||[]).length, total_analyzed:analyzed.length,
      total_recommended:ranked.length, briefing, finished_at:new Date().toISOString()
    }).eq('id', run.id);
    return { runId: run.id, briefing, total: analyzed.length };
  } catch (e) {
    await supabase.from('monitor_runs').update({ status:'failed', error:String(e.message||e), finished_at:new Date().toISOString() }).eq('id', run.id);
    throw e;
  }
}

export default async function handler(req, res) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    const auth = req.headers.authorization || '';
    const isCron = Boolean(cronSecret && auth === `Bearer ${cronSecret}`);

    if (isCron) {
      const admin = adminClient();
      const { data: prefs, error } = await admin.from('user_preferences').select('user_id').eq('monitor_enabled', true);
      if (error) throw error;
      const results = [];
      for (const row of prefs || []) {
        try { results.push({ userId: row.user_id, ...(await runForUser(admin,row.user_id,'scheduled',false)) }); }
        catch (e) { results.push({ userId: row.user_id, error: String(e.message||e) }); }
      }
      return json(res, 200, { ok:true, users: results.length, results });
    }

    const { supabase, user } = await requireUser(req);
    const input = req.method === 'POST' ? await body(req) : {};
    const result = await runForUser(supabase, user.id, input.triggerType || 'manual', Boolean(input.force));
    json(res, 200, { ok:true, result });
  } catch (error) {
    json(res, error.status || 500, { error: error.message || 'Falha no monitor.' });
  }
}
