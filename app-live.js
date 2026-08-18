const state = {
  config: null,
  supabase: null,
  session: null,
  profile: null,
  prefs: null,
  opportunities: [],
  earnings: [],
  lastRun: null,
  connected: false
};

const $ = (id) => document.getElementById(id);
const money = (n) => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const esc = (s='') => String(s).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

function notify(msg){ if (typeof window.toast === 'function') window.toast(msg); else alert(msg); }
function setBusy(el, busy){ if(!el) return; el.classList.toggle('live-loading', busy); }

function injectAuth() {
  const wrap = document.createElement('div');
  wrap.id = 'liveAuth';
  wrap.className = 'live-auth';
  wrap.innerHTML = `<div class="live-auth-card">
    <div class="live-auth-logo">V</div>
    <h2>Vania Work</h2>
    <p>Entre no painel pessoal da Vania. O banco de dados, os ganhos e o assistente ficam protegidos pela conta.</p>
    <div class="field"><label>E-mail</label><input id="liveEmail" type="email" autocomplete="email" placeholder="vania@exemplo.com"></div>
    <div class="field"><label>Senha</label><input id="livePassword" type="password" autocomplete="current-password" placeholder="••••••••"></div>
    <div id="liveAuthError" class="live-auth-error"></div>
    <div class="live-auth-actions"><button class="primary" id="liveLogin">Entrar</button></div>
    <p class="live-auth-note">O primeiro acesso será criado de forma controlada no backend; o site não libera cadastro público para evitar abuso e custos de IA.</p>
  </div>`;
  document.body.appendChild(wrap);
  $('liveLogin').onclick = signIn;
  $('livePassword').addEventListener('keydown', e => { if(e.key === 'Enter') signIn(); });
}

function injectDataModal() {
  const modal = document.createElement('div');
  modal.id = 'liveModal';
  modal.className = 'live-modal';
  modal.innerHTML = `<div class="live-modal-card">
    <div class="modal-head"><h3 id="liveModalTitle">Nova oportunidade</h3><button class="x" id="liveModalClose">×</button></div>
    <div id="liveModalBody"></div>
  </div>`;
  document.body.appendChild(modal);
  $('liveModalClose').onclick = closeLiveModal;
  modal.addEventListener('click', e => { if(e.target === modal) closeLiveModal(); });
}

function openLiveModal(title, html){ $('liveModalTitle').textContent = title; $('liveModalBody').innerHTML = html; $('liveModal').classList.add('show'); }
function closeLiveModal(){ $('liveModal').classList.remove('show'); }

async function fetchConfig(){
  try { const r = await fetch('/api/config', { cache:'no-store' }); return await r.json(); }
  catch { return { configured:false }; }
}

async function boot(){
  injectAuth(); injectDataModal();
  state.config = await fetchConfig();
  if(!state.config?.configured){
    markDemo('Backend preparado, aguardando a conexão do banco de dados. A interface continua em modo demonstração.');
    return;
  }
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
  state.supabase = createClient(state.config.supabaseUrl, state.config.supabasePublishableKey);
  const { data } = await state.supabase.auth.getSession();
  state.session = data.session;
  state.supabase.auth.onAuthStateChange((_event, session) => {
    state.session = session;
    if(session) connectLive(); else showAuth();
  });
  if(!state.session) showAuth(); else await connectLive();
}

function showAuth(){ $('liveAuth').classList.add('show'); }
function hideAuth(){ $('liveAuth').classList.remove('show'); }

async function signIn(){
  const email = $('liveEmail').value.trim(); const password = $('livePassword').value;
  const errBox = $('liveAuthError'); errBox.classList.remove('show');
  if(!email || !password){ errBox.textContent='Preencha e-mail e senha.'; errBox.classList.add('show'); return; }
  setBusy($('liveLogin'), true);
  const { error } = await state.supabase.auth.signInWithPassword({ email, password });
  setBusy($('liveLogin'), false);
  if(error){ errBox.textContent='Não foi possível entrar. Confira os dados de acesso.'; errBox.classList.add('show'); }
}

async function connectLive(){
  hideAuth(); state.connected = true;
  const demo = document.querySelector('.demo');
  if(demo){ demo.innerHTML = `<div>✓</div><div><b>Modo conectado.</b> Dados abaixo vêm do banco da Vania. A IA só automatiza ações permitidas pelas regras de cada plataforma.</div>`; demo.style.background='#ecfdf3'; demo.style.borderColor='#bbf7d0'; demo.style.color='#166534'; }
  addLiveControls();
  await loadDashboard();
  bindLiveActions();
  maybeRunLoginMonitor();
}

function markDemo(text){
  const demo = document.querySelector('.demo');
  if(demo) demo.innerHTML = `<div>ⓘ</div><div><b>Modo demonstração.</b> ${esc(text)}</div>`;
}

function addLiveControls(){
  if(document.getElementById('liveSignout')) return;
  const top = document.querySelector('.top-actions');
  if(top){ const b=document.createElement('button'); b.id='liveSignout'; b.className='live-signout'; b.textContent='Sair'; b.onclick=()=>state.supabase.auth.signOut(); top.prepend(b); }

  const head = document.querySelector('#oportunidades .panel-head');
  if(head){
    const select = $('oppFilter');
    const tools = document.createElement('div'); tools.className='live-toolbar';
    const add=document.createElement('button'); add.className='small-primary'; add.textContent='+ Adicionar'; add.onclick=openAddOpportunity;
    const earn=document.createElement('button'); earn.className='small-secondary'; earn.textContent='Registrar ganho'; earn.onclick=openAddEarning;
    tools.append(add,earn,select); head.appendChild(tools); if(select.parentElement===head) select.remove();
  }
}

async function loadDashboard(){
  if(!state.session) return;
  const uid = state.session.user.id;
  const [p1,p2,p3,p4,p5] = await Promise.all([
    state.supabase.from('profiles').select('*').eq('id',uid).maybeSingle(),
    state.supabase.from('user_preferences').select('*').eq('user_id',uid).maybeSingle(),
    state.supabase.from('opportunities').select('*').order('ai_score',{ascending:false,nullsFirst:false}).order('created_at',{ascending:false}).limit(100),
    state.supabase.from('earnings').select('*').order('earned_at',{ascending:false}).limit(100),
    state.supabase.from('monitor_runs').select('*').order('started_at',{ascending:false}).limit(1).maybeSingle()
  ]);
  state.profile=p1.data; state.prefs=p2.data; state.opportunities=p3.data||[]; state.earnings=p4.data||[]; state.lastRun=p5.data;
  hydrateHeader(); renderLiveOpportunities(); hydrateMetrics(); hydratePrefs(); hydrateBriefing();
}

function hydrateHeader(){
  const name=state.profile?.display_name||'Vania';
  const h1=document.querySelector('.hello h1'); if(h1) h1.textContent=`Bom dia, ${name} ✨`;
  const avatar=document.querySelector('.avatar'); if(avatar) avatar.textContent=name.trim().charAt(0).toUpperCase()||'V';
}

function platformClass(name=''){ const n=name.toLowerCase(); if(n.includes('upwork')||n.includes('99'))return'up'; if(n.includes('respond'))return'res'; if(n.includes('prolific')||n.includes('user'))return'pro'; return'out'; }
function payLabel(o){ const cur=o.currency||'USD'; const a=o.pay_min!=null?money(o.pay_min):'?'; const b=o.pay_max!=null&&Number(o.pay_max)!==Number(o.pay_min)?`–${money(o.pay_max)}`:''; return `${cur==='USD'?'US$':cur==='BRL'?'R$':cur} ${a}${b}`; }
function actionButton(o){
  if(o.automation_level==='blocked') return `<button class="small-secondary" onclick="window.vaniaExplainBlocked('${o.id}')">Automação bloqueada</button>`;
  if(o.automation_level==='human') return `<button class="small-primary" onclick="window.vaniaHuman('${o.id}')">Preciso da Vania</button>`;
  return `<button class="small-primary" onclick="window.vaniaProposal('${o.id}')">Gerar proposta com IA</button>`;
}
function liveOppHtml(o){ const score=o.ai_score; const scoreHtml=score==null?'<span class="live-ai-chip">IA pendente</span>':`<div class="score ${score<82?'medium':''}">${score}% compatível</div>`; return `<div class="opp" data-usd="${o.currency==='USD'}" data-score="${score||0}"><div class="opp-top"><div class="platform ${platformClass(o.platform)}">${esc(o.platform.slice(0,2))}</div><div class="opp-main"><div class="opp-title">${esc(o.title)}</div><div class="opp-sub">${esc(o.platform)} · ${esc(o.status)} · dado real</div></div>${scoreHtml}</div><div class="opp-data"><span>💵 <b>${esc(payLabel(o))}</b></span><span>⏱ <b>${o.estimated_minutes?`${o.estimated_minutes} min`:'a estimar'}</b></span>${o.ai_estimated_hourly_usd!=null?`<span>↗ <b>~US$ ${money(o.ai_estimated_hourly_usd)}/h</b></span>`:''}</div>${o.ai_summary?`<div class="live-subline"><b>IA:</b> ${esc(o.ai_summary)}</div>`:''}<div class="opp-actions" style="margin-top:12px">${actionButton(o)}<button class="small-secondary" onclick="window.vaniaAnalyze('${o.id}')">Analisar</button></div></div>`; }

function renderLiveOpportunities(){
  const rows=state.opportunities.filter(o=>!['completed','ignored','rejected'].includes(o.status));
  const empty=`<div class="live-empty"><b>Nenhuma oportunidade salva ainda.</b>Adicione uma vaga manualmente agora; depois as integrações permitidas alimentarão este painel.<br><button class="primary" onclick="window.vaniaAddOpportunity()">Adicionar primeira oportunidade</button></div>`;
  $('allOpps').innerHTML=rows.length?rows.map(liveOppHtml).join(''):empty;
  $('homeOpps').innerHTML=rows.length?rows.slice(0,3).map(liveOppHtml).join(''):empty;
}

function hydrateMetrics(){
  const confirmed=state.earnings.filter(e=>['confirmed','paid'].includes(e.status)).reduce((s,e)=>s+Number(e.amount_usd||0),0);
  const goal=Number(state.prefs?.goal_usd||50);
  $('earned').textContent=money(confirmed); $('progressBar').style.width=`${Math.min(100, goal?confirmed/goal*100:0)}%`;
  const goalValue=document.querySelector('.goal-value'); if(goalValue) goalValue.innerHTML=`US$ <span id="earned">${money(confirmed)}</span> / ${money(goal)}`;
  const metricHs=document.querySelectorAll('.metric h3');
  if(metricHs[0]) metricHs[0].textContent=`US$ ${money(goal)}`;
  const recommended=state.opportunities.filter(o=>(o.ai_score||0)>=70&&!['completed','ignored','rejected'].includes(o.status)).length;
  if(metricHs[1]) metricHs[1].textContent=String(recommended);
  if(metricHs[2]) metricHs[2].textContent=`${state.prefs?.work_hours||4}h`;
  if($('scanCount')) $('scanCount').textContent=String(state.lastRun?.total_analyzed ?? state.opportunities.length);
}

function hydratePrefs(){
  if(!state.prefs) return;
  $('nameField').value=state.profile?.display_name||'Vania';
  $('hoursField').value=`${state.prefs.work_hours} ${state.prefs.work_hours===1?'hora':'horas'}`;
  $('goalField').value=`US$ ${Number(state.prefs.goal_usd||50)}`;
  $('cycleField').value=`${state.prefs.monitor_cycle_hours||12} horas`;
  const mbtn=$('monitorToggle'); if(mbtn) mbtn.innerHTML=`● <span>Monitor ${state.prefs.monitor_cycle_hours||12}h</span>`;
}

function hydrateBriefing(){
  const card=document.querySelector('.monitor'); if(!card) return;
  let last=card.querySelector('.live-monitor-last'); if(!last){last=document.createElement('div');last.className='live-monitor-last';card.appendChild(last);}
  if(state.lastRun?.started_at){ const dt=new Date(state.lastRun.started_at).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}); last.textContent=`Última organização: ${dt} · ${state.lastRun.total_recommended||0} recomendadas`; }
  else last.textContent='O primeiro ciclo real ainda não foi executado.';
}

function bindLiveActions(){
  $('savePrefs').onclick=savePrefs;
  $('askBtn').onclick=askAI;
  $('monitorToggle').onclick=()=>runMonitor(true);
  $('oppFilter').onchange=filterOpps;
}

async function savePrefs(){
  const uid=state.session.user.id;
  const display=$('nameField').value.trim()||'Vania';
  const hours=parseInt($('hoursField').value)||4; const goal=parseFloat($('goalField').value.replace(/[^0-9.,]/g,'').replace(',','.'))||50; const cycle=parseInt($('cycleField').value)||12;
  setBusy($('savePrefs'),true);
  const [a,b]=await Promise.all([
    state.supabase.from('profiles').update({display_name:display}).eq('id',uid),
    state.supabase.from('user_preferences').update({work_hours:hours,goal_usd:goal,monitor_cycle_hours:cycle}).eq('user_id',uid)
  ]);
  setBusy($('savePrefs'),false);
  if(a.error||b.error) return notify('Não foi possível salvar as preferências.');
  notify('Preferências salvas no banco ✓'); await loadDashboard();
}

async function authFetch(path, options={}){
  const token=state.session?.access_token; const headers={...(options.headers||{}),'Content-Type':'application/json'}; if(token) headers.Authorization=`Bearer ${token}`;
  const r=await fetch(path,{...options,headers}); const data=await r.json().catch(()=>({})); if(!r.ok) throw new Error(data.error||'Falha na operação.'); return data;
}

async function askAI(){
  const q=$('assistantInput').value.trim(); if(!q)return; $('assistantBubble').innerHTML='<b>IA pensando…</b>'; $('assistantInput').value='';
  try{ const d=await authFetch('/api/ai/assistant',{method:'POST',body:JSON.stringify({question:q})}); $('assistantBubble').textContent=d.answer; }
  catch(e){ $('assistantBubble').textContent=`Não consegui responder agora: ${e.message}`; }
}

async function runMonitor(force=false){
  const b=$('monitorToggle'); setBusy(b,true); notify('Organizando as oportunidades…');
  try{ await authFetch('/api/monitor',{method:'POST',body:JSON.stringify({force,triggerType:'manual'})}); notify('Monitor concluído ✓'); await loadDashboard(); }
  catch(e){ notify(`Monitor: ${e.message}`); }
  finally{ setBusy(b,false); }
}

async function maybeRunLoginMonitor(){
  const cycle=state.prefs?.monitor_cycle_hours||12; const last=state.lastRun?.started_at?new Date(state.lastRun.started_at).getTime():0; const due=!last||(Date.now()-last)>=cycle*3600000;
  if(due){ try{ await authFetch('/api/monitor',{method:'POST',body:JSON.stringify({force:false,triggerType:'login'})}); await loadDashboard(); }catch{} }
}

function filterOpps(e){ document.querySelectorAll('#allOpps .opp').forEach(el=>{ const v=e.target.value; const ok=v==='all'||(v==='usd'&&el.dataset.usd==='true')||(v==='high'&&+el.dataset.score>=90); el.style.display=ok?'block':'none'; }); }

function openAddOpportunity(){
  openLiveModal('Adicionar oportunidade', `<div class="live-form-grid">
    <div class="field"><label>Plataforma</label><select id="loPlatform"><option>Upwork</option><option>99Freelas</option><option>Respondent</option><option>Prolific</option><option>Outlier</option><option>UserTesting</option><option>Outro</option></select></div>
    <div class="field"><label>Moeda</label><select id="loCurrency"><option value="USD">USD — dólar</option><option value="BRL">BRL — real</option></select></div>
    <div class="field full"><label>Título</label><input id="loTitle" placeholder="Ex.: Assistente virtual para cadastro de produtos"></div>
    <div class="field full"><label>Descrição</label><textarea id="loDescription" placeholder="Cole aqui a descrição da oportunidade."></textarea></div>
    <div class="field"><label>Pagamento mínimo</label><input id="loPay" type="number" min="0" step="0.01" placeholder="35"></div>
    <div class="field"><label>Tempo estimado (min)</label><input id="loMinutes" type="number" min="1" placeholder="120"></div>
    <div class="field full"><label>Link original</label><input id="loUrl" type="url" placeholder="https://..."></div>
  </div><div class="live-actions"><button class="secondary" onclick="window.vaniaCloseLiveModal()">Cancelar</button><button class="primary" id="loSave">Salvar e analisar</button></div>`);
  $('loSave').onclick=saveOpportunity;
}

async function saveOpportunity(){
  const title=$('loTitle').value.trim(); if(!title)return notify('Digite o título da oportunidade.');
  const row={ user_id:state.session.user.id, platform:$('loPlatform').value, title, description:$('loDescription').value.trim(), currency:$('loCurrency').value, pay_min:$('loPay').value?Number($('loPay').value):null, pay_max:$('loPay').value?Number($('loPay').value):null, estimated_minutes:$('loMinutes').value?Number($('loMinutes').value):null, source_url:$('loUrl').value.trim()||null, source_type:'manual', automation_level:['Respondent','Prolific','Outlier','UserTesting'].includes($('loPlatform').value)?'human':'approve' };
  setBusy($('loSave'),true); const {data,error}=await state.supabase.from('opportunities').insert(row).select('*').single(); setBusy($('loSave'),false);
  if(error)return notify('Não foi possível salvar.'); closeLiveModal(); notify('Oportunidade salva. A IA vai analisar agora.');
  try{ await authFetch('/api/ai/analyze',{method:'POST',body:JSON.stringify({opportunityId:data.id})}); }catch(e){ notify(`Salva, mas a IA não analisou: ${e.message}`); }
  await loadDashboard();
}

function openAddEarning(){
  const opts=state.opportunities.map(o=>`<option value="${o.id}">${esc(o.platform)} — ${esc(o.title)}</option>`).join('');
  openLiveModal('Registrar ganho', `<div class="live-form-grid"><div class="field full"><label>Oportunidade</label><select id="leOpp"><option value="">Sem vínculo</option>${opts}</select></div><div class="field"><label>Valor</label><input id="leAmount" type="number" min="0" step="0.01" placeholder="25"></div><div class="field"><label>Moeda</label><select id="leCurrency"><option value="USD">USD</option><option value="BRL">BRL</option></select></div><div class="field"><label>Status</label><select id="leStatus"><option value="confirmed">Confirmado</option><option value="paid">Pago</option><option value="pending">Pendente</option></select></div><div class="field"><label>Valor equivalente em USD</label><input id="leUsd" type="number" min="0" step="0.01" placeholder="opcional"></div></div><div class="live-actions"><button class="secondary" onclick="window.vaniaCloseLiveModal()">Cancelar</button><button class="primary" id="leSave">Registrar</button></div>`);
  $('leSave').onclick=saveEarning;
}

async function saveEarning(){
  const amount=Number($('leAmount').value); if(!Number.isFinite(amount)||amount<0)return notify('Informe um valor válido.'); const oid=$('leOpp').value; const opp=state.opportunities.find(o=>o.id===oid); const cur=$('leCurrency').value; const usd=$('leUsd').value?Number($('leUsd').value):(cur==='USD'?amount:null);
  const row={user_id:state.session.user.id,opportunity_id:oid||null,platform:opp?.platform||'Manual',amount,currency:cur,amount_usd:usd,status:$('leStatus').value,paid_at:$('leStatus').value==='paid'?new Date().toISOString():null};
  setBusy($('leSave'),true); const {error}=await state.supabase.from('earnings').insert(row); setBusy($('leSave'),false); if(error)return notify('Não foi possível registrar o ganho.'); closeLiveModal(); notify('Ganho registrado ✓'); await loadDashboard();
}

async function analyze(id){ try{ notify('IA analisando…'); await authFetch('/api/ai/analyze',{method:'POST',body:JSON.stringify({opportunityId:id})}); notify('Análise concluída ✓'); await loadDashboard(); }catch(e){notify(e.message);} }
async function proposal(id){ try{ notify('Preparando proposta…'); const d=await authFetch('/api/ai/proposal',{method:'POST',body:JSON.stringify({opportunityId:id})}); $('proposalText').textContent=d.proposal; $('modal').classList.add('show'); }catch(e){notify(e.message);} }
function human(id){ const o=state.opportunities.find(x=>x.id===id); notify(`${o?.platform||'Esta plataforma'} exige que esta etapa seja feita pessoalmente pela Vania.`); }
function blocked(){ notify('Automação bloqueada pela regra desta plataforma. O Vania Work não executará esta etapa.'); }

window.vaniaAnalyze=analyze; window.vaniaProposal=proposal; window.vaniaHuman=human; window.vaniaExplainBlocked=blocked; window.vaniaAddOpportunity=openAddOpportunity; window.vaniaCloseLiveModal=closeLiveModal;

boot();
