-- Vania Work: núcleo de autenticação, oportunidades, ganhos e monitor.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Vania',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  work_hours integer not null default 4 check (work_hours between 1 and 12),
  goal_usd numeric(10,2) not null default 50 check (goal_usd >= 0),
  monitor_cycle_hours integer not null default 12 check (monitor_cycle_hours in (12,24)),
  monitor_enabled boolean not null default true,
  priority text not null default 'hourly_value' check (priority in ('hourly_value','approval_chance','easy_first')),
  languages text[] not null default array['pt-BR','en'],
  updated_at timestamptz not null default now()
);

create table if not exists public.opportunities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null,
  external_id text,
  title text not null,
  description text,
  source_url text,
  source_type text not null default 'manual',
  currency text not null default 'USD',
  pay_min numeric(12,2),
  pay_max numeric(12,2),
  estimated_minutes integer check (estimated_minutes is null or estimated_minutes > 0),
  status text not null default 'new' check (status in ('new','saved','applied','selected','in_progress','completed','rejected','ignored')),
  automation_level text not null default 'human' check (automation_level in ('auto','approve','human','blocked')),
  raw_data jsonb not null default '{}'::jsonb,
  ai_score integer check (ai_score is null or ai_score between 0 and 100),
  ai_summary text,
  ai_reason text,
  ai_action text,
  ai_risk text,
  ai_estimated_hourly_usd numeric(12,2),
  ai_last_analyzed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists opportunities_user_platform_external_uidx
  on public.opportunities(user_id, platform, external_id)
  where external_id is not null;

create index if not exists opportunities_user_status_idx on public.opportunities(user_id, status, created_at desc);
create index if not exists opportunities_user_score_idx on public.opportunities(user_id, ai_score desc nulls last);

create table if not exists public.earnings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  opportunity_id uuid references public.opportunities(id) on delete set null,
  platform text not null,
  amount numeric(12,2) not null check (amount >= 0),
  currency text not null default 'USD',
  amount_usd numeric(12,2),
  status text not null default 'pending' check (status in ('pending','confirmed','paid')),
  note text,
  earned_at timestamptz not null default now(),
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists earnings_user_date_idx on public.earnings(user_id, earned_at desc);

create table if not exists public.monitor_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cycle_hours integer not null check (cycle_hours in (12,24)),
  trigger_type text not null default 'scheduled' check (trigger_type in ('scheduled','manual','login')),
  status text not null default 'running' check (status in ('running','completed','failed','skipped')),
  total_found integer not null default 0,
  total_analyzed integer not null default 0,
  total_recommended integer not null default 0,
  briefing jsonb not null default '{}'::jsonb,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists monitor_runs_user_started_idx on public.monitor_runs(user_id, started_at desc);

create table if not exists public.ai_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  opportunity_id uuid references public.opportunities(id) on delete set null,
  event_type text not null check (event_type in ('analysis','proposal','assistant','monitor')),
  model text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.platform_rules (
  platform text primary key,
  automation_policy jsonb not null default '{}'::jsonb,
  notes text,
  source_url text,
  verified_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.user_preferences enable row level security;
alter table public.opportunities enable row level security;
alter table public.earnings enable row level security;
alter table public.monitor_runs enable row level security;
alter table public.ai_events enable row level security;
alter table public.platform_rules enable row level security;

-- Usuária autenticada vê e altera somente seus próprios dados.
drop policy if exists "profiles_self_all" on public.profiles;
create policy "profiles_self_all" on public.profiles for all using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "preferences_self_all" on public.user_preferences;
create policy "preferences_self_all" on public.user_preferences for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "opportunities_self_all" on public.opportunities;
create policy "opportunities_self_all" on public.opportunities for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "earnings_self_all" on public.earnings;
create policy "earnings_self_all" on public.earnings for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "monitor_runs_self_all" on public.monitor_runs;
create policy "monitor_runs_self_all" on public.monitor_runs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "ai_events_self_select" on public.ai_events;
create policy "ai_events_self_select" on public.ai_events for select using (auth.uid() = user_id);
drop policy if exists "ai_events_self_insert" on public.ai_events;
create policy "ai_events_self_insert" on public.ai_events for insert with check (auth.uid() = user_id);

drop policy if exists "platform_rules_authenticated_read" on public.platform_rules;
create policy "platform_rules_authenticated_read" on public.platform_rules for select to authenticated using (true);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();

drop trigger if exists preferences_set_updated_at on public.user_preferences;
create trigger preferences_set_updated_at before update on public.user_preferences for each row execute function public.set_updated_at();

drop trigger if exists opportunities_set_updated_at on public.opportunities;
create trigger opportunities_set_updated_at before update on public.opportunities for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', 'Vania'))
  on conflict (id) do nothing;

  insert into public.user_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Regras iniciais. A aplicação ainda verifica as regras atuais antes de ampliar automações.
insert into public.platform_rules(platform, automation_policy, notes)
values
('Upwork', '{"prepare_proposal":"approve","translate":"auto","bulk_spam":"blocked","execution":"human_or_client_policy"}', 'Priorizar integrações oficiais e revisão humana antes do envio.'),
('Respondent', '{"notifications":"auto","translate":"auto","screener":"human","research":"human","bot_answers":"blocked"}', 'Screeners e participação são pessoais.'),
('Prolific', '{"notifications":"auto","ranking":"auto","reserve_by_bot":"blocked","study_answers":"human","ai_answers":"blocked"}', 'Automação serve apenas para organizar e priorizar.'),
('Outlier', '{"notifications":"auto","schedule":"auto","assessment":"human","project_task":"human","external_bot":"blocked"}', 'Ferramentas externas dependem das regras do projeto.'),
('UserTesting', '{"notifications":"auto","schedule":"auto","screener":"human","test":"human","ai_during_test":"blocked"}', 'Teste e respostas precisam ser pessoais.'),
('99Freelas', '{"filter":"auto","prepare_proposal":"approve","mass_send":"blocked","delivery":"human_or_client_policy"}', 'Evitar spam e respeitar o combinado com o cliente.')
on conflict (platform) do update set automation_policy = excluded.automation_policy, notes = excluded.notes, updated_at = now();
