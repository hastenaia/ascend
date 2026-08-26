-- Ascend Phase 5 — Character Stats + Skill Tree
-- Builds on 0001–0004. Additive, idempotent.
--
-- Design:
--   * 8 game-style stat attributes (NOT scientific measurements).
--   * Quest categories map to stats with fixed weights; points derive ONLY from
--     XP actually awarded by complete_quest (already deduped per period), so
--     farming is bounded by the same rules that bound XP.
--   * Every stat/skill change is journaled (stat_history / skill_xp_log) and the
--     user_stats / user_skills snapshots are recomputed from those ledgers —
--     single source of truth, like user_levels.
--   * Clients get SELECT-only on all four tables; writes happen exclusively
--     inside SECURITY DEFINER functions.

-- =====================================================
-- Stat catalog: the 8 progression attributes
-- =====================================================
insert into public.stats (slug, name, description) values
  ('physical',               'Physical',               'Movement, training, recovery'),
  ('mental',                 'Mental',                 'Focus, clarity, resilience'),
  ('intellect',              'Intellect',              'Learning and problem solving'),
  ('emotional-intelligence', 'Emotional Intelligence', 'Understanding self and others'),
  ('discipline',             'Discipline',             'Consistency and follow-through'),
  ('knowledge',              'Knowledge',              'Domains mastered and retained'),
  ('social',                 'Social',                 'Connection and leadership'),
  ('career',                 'Career',                 'Professional craft and growth')
on conflict (slug) do update set name = excluded.name, description = excluded.description;

-- =====================================================
-- Skill tree: extend catalog + seed branches/leaves
-- =====================================================
alter table public.skills add column if not exists category text;
alter table public.skills add column if not exists parent_id uuid references public.skills(id) on delete cascade;
alter table public.skills add column if not exists sort_order int not null default 0;
alter table public.skills add column if not exists unlock_xp int not null default 100;
create index if not exists idx_skills_category on public.skills(category);
create index if not exists idx_skills_parent on public.skills(parent_id);

with branch(slug, category, name, description, sort_order) as (values
  ('phy-conditioning','physical','Conditioning','Strength, endurance, mobility, recovery',0),
  ('phy-athletics','physical','Athletics','Running, bodyweight, sport, intervals',1),
  ('men-clarity','mental','Clarity','Attention, calm, mental reset',0),
  ('men-resilience','mental','Resilience','Stress control and grit',1),
  ('int-learning','intellect','Learning','Reading, studying, research, deep work',0),
  ('int-problem-solving','intellect','Problem Solving','Logic, math, coding, critical thinking',1),
  ('eq-communication','emotional-intelligence','Communication','Listening, speaking, writing clearly',0),
  ('eq-empathy','emotional-intelligence','Empathy','Perspective, conflict, compassion',1),
  ('dis-routines','discipline','Routines','Daily structure that holds',0),
  ('dis-execution','discipline','Execution','Finishing what matters',1),
  ('kno-domains','knowledge','Domains','Programming, systems, finance, science',0),
  ('kno-synthesis','knowledge','Synthesis','Notes, retention, teaching, application',1),
  ('soc-connection','social','Connection','Teamwork, networking, mentoring',0),
  ('soc-leadership','social','Leadership','Leading, coaching, community',1),
  ('car-craft','career','Craft','Portfolio, interviews, brand',0),
  ('car-growth','career','Growth','Negotiation, ownership, research',1)
), ins_b as (
  insert into public.skills (slug, name, description, category, parent_id, sort_order)
  select slug, name, description, category, null::uuid, sort_order from branch
  on conflict (slug) do update set name = excluded.name, description = excluded.description,
    category = excluded.category, sort_order = excluded.sort_order
  returning slug, id, category, sort_order
)
-- leaves (idempotent: only insert when missing; names/descriptions kept fresh via upsert below)
insert into public.skills (slug, name, description, category, parent_id, sort_order, unlock_xp)
select v.slug, v.name, v.descr, b.category, b.id, v.sort_order, 100
from (values
  ('phy-strength','Strength','Build and maintain raw strength',0,'phy-conditioning'),
  ('phy-endurance','Endurance','Sustain output longer',1,'phy-conditioning'),
  ('phy-mobility','Mobility','Move well, stay injury-free',2,'phy-conditioning'),
  ('phy-recovery','Recovery','Sleep, rest, deliberate restoration',3,'phy-conditioning'),
  ('phy-running','Running','Aerobic base and pacing',0,'phy-athletics'),
  ('phy-bodyweight','Bodyweight','Master your own mass',1,'phy-athletics'),
  ('phy-sport','Sport Play','Skillful movement through play',2,'phy-athletics'),
  ('phy-intervals','Interval Training','Short, hard, repeatable efforts',3,'phy-athletics'),
  ('men-meditation','Meditation','Train attention directly',0,'men-clarity'),
  ('men-breathwork','Breathwork','Regulate state through breath',1,'men-clarity'),
  ('men-journaling','Journaling','Clear the mind on paper',2,'men-clarity'),
  ('men-digital-detox','Digital Detox','Reclaim attention from feeds',3,'men-clarity'),
  ('men-stress-management','Stress Management','Perform under load without burning',0,'men-resilience'),
  ('men-grit','Grit','Persist when it stops being fun',1,'men-resilience'),
  ('men-patience','Patience','Play long games well',2,'men-resilience'),
  ('men-adaptability','Adaptability','Reset fast when plans break',3,'men-resilience'),
  ('int-reading','Reading','Read widely and deeply',0,'int-learning'),
  ('int-studying','Studying','Learn hard things efficiently',1,'int-learning'),
  ('int-research','Research','Find truth in primary sources',2,'int-learning'),
  ('int-deep-work','Deep Work','Long uninterrupted focus',3,'int-learning'),
  ('int-logic','Logic','Argue and debug rigorously',0,'int-problem-solving'),
  ('int-mathematics','Mathematics','The language of structure',1,'int-problem-solving'),
  ('int-coding','Coding','Build working software',2,'int-problem-solving'),
  ('int-critical-thinking','Critical Thinking','Question claims, test ideas',3,'int-problem-solving'),
  ('eq-active-listening','Active Listening','Hear what is actually said',0,'eq-communication'),
  ('eq-public-speaking','Public Speaking','Speak clearly under eyes',1,'eq-communication'),
  ('eq-clear-writing','Clear Writing','Be understood in writing',2,'eq-communication'),
  ('eq-storytelling','Storytelling','Make ideas land and stick',3,'eq-communication'),
  ('eq-perspective-taking','Perspective Taking','Model other minds accurately',0,'eq-empathy'),
  ('eq-conflict-resolution','Conflict Resolution','Repair and align relationships',1,'eq-empathy'),
  ('eq-feedback','Feedback','Give and receive without ego',2,'eq-empathy'),
  ('eq-compassion','Compassion','Care that acts',3,'eq-empathy'),
  ('dis-morning-routine','Morning Routine','Win the first hour',0,'dis-routines'),
  ('dis-time-blocking','Time Blocking','Give every hour a job',1,'dis-routines'),
  ('dis-habit-stacking','Habit Stacking','Chain small habits that stick',2,'dis-routines'),
  ('dis-sleep-discipline','Sleep Discipline','Consistent, protected sleep',3,'dis-routines'),
  ('dis-single-tasking','Single-Tasking','One thing until done',0,'dis-execution'),
  ('dis-deadline-keeping','Deadline Keeping','Ship when you said you would',1,'dis-execution'),
  ('dis-difficult-tasks','Difficult Tasks','Choose the hard thing first',2,'dis-execution'),
  ('dis-consistency','Consistency','Show up on low-motivation days',3,'dis-execution'),
  ('kno-programming','Programming','Software as a craft',0,'kno-domains'),
  ('kno-systems-thinking','Systems Thinking','See feedback loops and second order effects',1,'kno-domains'),
  ('kno-finance','Finance','Money mechanics and compounding',2,'kno-domains'),
  ('kno-science','Science','How evidence actually works',3,'kno-domains'),
  ('kno-note-taking','Note-Taking','Capture thinking for later you',0,'kno-synthesis'),
  ('kno-spaced-repetition','Spaced Repetition','Remember what matters',1,'kno-synthesis'),
  ('kno-teaching-others','Teaching Others','Learn by explaining',2,'kno-synthesis'),
  ('kno-application','Application','Use knowledge on real problems',3,'kno-synthesis'),
  ('soc-teamwork','Teamwork','Make groups better than sum of parts',0,'soc-connection'),
  ('soc-networking','Networking','Relationships built deliberately',1,'soc-connection'),
  ('soc-mentoring','Mentoring','Lift someone a level',2,'soc-connection'),
  ('soc-meaningful-talk','Meaningful Talk','Beyond small talk, on purpose',3,'soc-connection'),
  ('soc-delegation','Delegation','Multiply through others',0,'soc-leadership'),
  ('soc-public-leadership','Public Leadership','Take responsibility visibly',1,'soc-leadership'),
  ('soc-coaching','Coaching','Grow capability in people',2,'soc-leadership'),
  ('soc-community-building','Community Building','Create belonging at scale',3,'soc-leadership'),
  ('car-portfolio','Portfolio Building','Proof of work, made public',0,'car-craft'),
  ('car-job-search','Job Search','Find and win the right seat',1,'car-craft'),
  ('car-interviewing','Interviewing','Present true value under pressure',2,'car-craft'),
  ('car-personal-brand','Personal Brand','Reputation with intent',3,'car-craft'),
  ('car-negotiation','Negotiation','Create value, then claim fair share',0,'car-growth'),
  ('car-project-ownership','Project Ownership','Own outcomes end to end',1,'car-growth'),
  ('car-seeking-mentorship','Seeking Mentorship','Stand on shoulders deliberately',2,'car-growth'),
  ('car-industry-research','Industry Research','Know the map of your field',3,'car-growth')
) as v(slug,name,descr,sort_order,parent_slug)
join ins_b b on b.slug = v.parent_slug
on conflict (slug) do update set name = excluded.name, description = excluded.description,
  category = excluded.category, parent_id = excluded.parent_id, sort_order = excluded.sort_order,
  unlock_xp = excluded.unlock_xp;

-- =====================================================
-- Ledgers: stat_history + skill_xp_log (append-only truth)
-- =====================================================
create table if not exists public.stat_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  stat_id uuid not null references public.stats(id) on delete cascade,
  delta int not null,
  source_type text not null default 'quest',
  source_id uuid,
  description text,
  source_key text,
  created_at timestamptz not null default now()
);
create index if not exists idx_stat_history_user_stat on public.stat_history(user_id, stat_id, created_at desc);
create unique index if not exists uq_stat_history_source_key
  on public.stat_history(user_id, source_key) where source_key is not null;

create table if not exists public.skill_xp_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  skill_id uuid not null references public.skills(id) on delete cascade,
  delta int not null check (delta >= 0),
  source_type text not null default 'quest',
  source_key text,
  created_at timestamptz not null default now()
);
create index if not exists idx_skill_xp_log_user_skill on public.skill_xp_log(user_id, skill_id);
create unique index if not exists uq_skill_xp_log_source_key
  on public.skill_xp_log(user_id, skill_id, source_key) where source_key is not null;

alter table public.stat_history enable row level security;
alter table public.skill_xp_log enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='stat_history' and policyname='sh_select_own') then
    create policy sh_select_own on public.stat_history for select to authenticated using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='skill_xp_log' and policyname='sxl_select_own') then
    create policy sxl_select_own on public.skill_xp_log for select to authenticated using (auth.uid() = user_id);
  end if;
end $$;

-- Snapshots become read-only for clients: writes flow through definer RPCs only
drop policy if exists ust_insert_own on public.user_stats;
drop policy if exists ust_update_own on public.user_stats;
drop policy if exists ust_delete_own on public.user_stats;
drop policy if exists us_insert_own on public.user_skills;
drop policy if exists us_update_own on public.user_skills;
drop policy if exists us_delete_own on public.user_skills;

-- =====================================================
-- Backfill real history into ledgers + snapshots (idempotent)
-- Category→stat weights mirror CATEGORY_STAT_WEIGHTS in src/lib/stats.ts
-- =====================================================
with txs as (
  select x.id tx_id, x.user_id, x.amount, x.source_key, x.description,
         coalesce(q.category, 'general') cat
  from public.xp_transactions x
  join public.quests q on q.id = x.quest_id
  where x.source_type = 'quest'
),
weights(cat, stat_slug, weight) as (values
  ('physical','physical',1.00),
  ('discipline','discipline',0.70),('discipline','mental',0.30),
  ('reflection','mental',0.70),('reflection','emotional-intelligence',0.30),
  ('intellect','intellect',0.60),('intellect','knowledge',0.40),
  ('craft','knowledge',0.50),('craft','career',0.30),('craft','mental',0.20),
  ('work','career',0.60),('work','discipline',0.40),
  ('general','social',0.40),('general','emotional-intelligence',0.35),('general','mental',0.25)
),
points as (
  select t.user_id, s.id stat_id, round(t.amount * w.weight)::int delta,
         t.tx_id, t.description, t.source_key || ':stat:' || s.slug sk
  from txs t join weights w on w.cat = t.cat join public.stats s on s.slug = w.stat_slug
  where round(t.amount * w.weight) > 0
)
insert into public.stat_history (user_id, stat_id, delta, source_type, source_id, description, source_key)
select user_id, stat_id, delta, 'quest', tx_id, left(coalesce(description, ''), 120), sk
from points p
where not exists (select 1 from public.stat_history h where h.user_id = p.user_id and h.source_key = p.sk);

-- linked skills: leaf gets full awarded XP, parent branch gets half
with txs as (
  select x.user_id, x.amount, x.source_key, x.id tx_id, q.linked_skill
  from public.xp_transactions x
  join public.quests q on q.id = x.quest_id
  where x.source_type = 'quest' and q.linked_skill is not null
),
targets as (
  select user_id, linked_skill skill_id, amount delta, source_key || ':skill:self' sk, tx_id from txs
  union all
  select t.user_id, p.id, ceil(t.amount * 0.5)::int, t.source_key || ':skill:parent' sk, t.tx_id
  from txs t
  join public.skills leaf on leaf.id = t.linked_skill
  join public.skills p on p.id = leaf.parent_id
  where ceil(t.amount * 0.5) > 0
)
insert into public.skill_xp_log (user_id, skill_id, delta, source_type, source_key)
select user_id, skill_id, delta, 'quest', sk
from targets
where not exists (select 1 from public.skill_xp_log l where l.user_id = targets.user_id and l.skill_id = targets.skill_id and l.source_key = targets.sk);

-- Rebuild snapshots from ledgers (authoritative)
insert into public.user_stats (user_id, stat_id, value)
select h.user_id, h.stat_id, sum(h.delta)::numeric
from public.stat_history h group by h.user_id, h.stat_id
on conflict (user_id, stat_id) do update set value = excluded.value, updated_at = now();

insert into public.user_skills (user_id, skill_id, xp)
select l.user_id, l.skill_id, sum(l.delta)::int
from public.skill_xp_log l group by l.user_id, l.skill_id
on conflict (user_id, skill_id) do update set xp = excluded.xp, updated_at = now();

-- =====================================================
-- complete_quest v2 — same transactional guarantees as 0003/0004
-- plus: stat points + skill XP derived from XP actually awarded.
-- Runs only when v_xp_awarded > 0 → repeat-completion windows grant nothing.
-- =====================================================
create or replace function public.complete_quest(p_quest_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_quest public.quests%rowtype;
  v_xp_awarded int := 0;
  v_already boolean := false;
  v_milestone_updated boolean := false;
  v_period_key text;
  v_score int;
  v_prev_streak int := 0;
  v_cur_streak int := 0;
  v_new_streak int := 1;
  v_today date := current_date;
  v_total bigint := 0;
  v_level int := 1;
  v_next_needed bigint := 0;
  r record;
  v_pts int;
  v_parent uuid;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  -- Validate quest exists AND belongs to caller (row lock prevents races)
  select * into v_quest from public.quests where id = p_quest_id and user_id = v_user for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'quest_not_found');
  end if;

  if v_quest.status = 'completed' or v_quest.status = 'archived' then
    if v_quest.status = 'archived' then
      return jsonb_build_object('ok', false, 'error', 'quest_archived');
    end if;
    v_already := true;
  end if;

  if v_already then
    select coalesce(sum(amount), 0) into v_total from public.xp_transactions where user_id = v_user;
    return jsonb_build_object(
      'ok', true,
      'already_completed', true,
      'xp_awarded', 0,
      'xp_total', v_total,
      'level', public.level_from_xp(v_total),
      'xp_to_next', greatest(0, public.xp_for_level(public.level_from_xp(v_total) + 1) - v_total),
      'milestone_updated', false,
      'streak', (select streak from public.momentum where user_id = v_user and date = v_today limit 1)
    );
  end if;

  -- Period-scoped dedupe key: recurring quests award once per day/week
  v_period_key := case
    when v_quest.recurrence = 'daily' then 'quest:' || v_quest.id::text || ':' || to_char(v_today, 'YYYY-MM-DD')
    when v_quest.recurrence = 'weekly' then 'quest:' || v_quest.id::text || ':w' || to_char(v_today, 'IYYY-"W"IW')
    else 'quest:' || v_quest.id::text
  end;

  -- Mark one-time quests completed (recurring stay active)
  if v_quest.recurrence = 'none' then
    update public.quests set status = 'completed', completed_at = now() where id = v_quest.id;
  end if;

  -- Log the completion event
  insert into public.quest_completions (user_id, quest_id, xp_awarded)
  values (v_user, v_quest.id, v_quest.xp_reward);

  -- Award XP; unique index on (user_id, source_key) blocks repeat farming
  begin
    insert into public.xp_transactions (user_id, amount, source, source_type, source_id, source_key, description)
    values (v_user, v_quest.xp_reward, 'quest:' || v_quest.id::text, 'quest', v_quest.id, v_period_key, v_quest.title);
    v_xp_awarded := v_quest.xp_reward;
  exception when unique_violation then
    v_xp_awarded := 0; -- already awarded in this window
  end;

  -- Milestone auto-complete when all of its quests are done (never downgrades)
  if v_quest.milestone_id is not null then
    update public.milestones m
    set status = 'completed'
    where m.id = v_quest.milestone_id
      and m.status <> 'completed'
      and exists (select 1 from public.quests q where q.milestone_id = m.id)
      and not exists (
        select 1 from public.quests q
        where q.milestone_id = m.id and q.status = 'active'
      );
    v_milestone_updated := found;
  end if;

  -- Momentum: daily score by difficulty + streak continuation
  v_score := case v_quest.difficulty
    when 'easy' then 5 when 'hard' then 15 when 'challenge' then 25 else 10
  end;

  insert into public.momentum (user_id, date, score, streak)
  values (v_user, v_today, v_score, 0)
  on conflict (user_id, date) do update set score = public.momentum.score + excluded.score;

  select coalesce(streak, 0) into v_prev_streak from public.momentum where user_id = v_user and date = v_today - 1;
  select coalesce(streak, 0) into v_cur_streak from public.momentum where user_id = v_user and date = v_today;

  v_new_streak := greatest(v_cur_streak, case when v_prev_streak > 0 then v_prev_streak + 1 else 1 end);

  update public.momentum
  set streak = v_new_streak
  where user_id = v_user and date = v_today and streak < v_new_streak;

  ---------------------------------------------------------------
  -- PHASE 5: stats + skills — only when this completion earned XP
  ---------------------------------------------------------------
  if v_xp_awarded > 0 then
    -- Stats: weighted journal rows, snapshot recomputed per touched stat
    for r in
      select w.stat_slug, w.weight
      from (values
        ('physical','physical',1.00),
        ('discipline','discipline',0.70),('discipline','mental',0.30),
        ('reflection','mental',0.70),('reflection','emotional-intelligence',0.30),
        ('intellect','intellect',0.60),('intellect','knowledge',0.40),
        ('craft','knowledge',0.50),('craft','career',0.30),('craft','mental',0.20),
        ('work','career',0.60),('work','discipline',0.40),
        ('general','social',0.40),('general','emotional-intelligence',0.35),('general','mental',0.25)
      ) as w(cat, stat_slug, weight)
      where w.cat = v_quest.category
    loop
      v_pts := round(v_xp_awarded * r.weight);
      if v_pts > 0 then
        insert into public.stat_history (user_id, stat_id, delta, source_type, source_id, description, source_key)
        select v_user, s.id, v_pts, 'quest', v_quest.id, left(v_quest.title, 120), v_period_key || ':stat:' || s.slug
        from public.stats s where s.slug = r.stat_slug
        on conflict do nothing;

        -- Snapshot = ledger sum (authoritative, idempotent)
        insert into public.user_stats (user_id, stat_id, value)
        select v_user, s.id,
          (select coalesce(sum(h.delta), 0)::numeric from public.stat_history h where h.user_id = v_user and h.stat_id = s.id)
        from public.stats s where s.slug = r.stat_slug
        on conflict (user_id, stat_id) do update set value = excluded.value, updated_at = now();
      end if;
    end loop;

    -- Linked skill: full XP to leaf, half to parent branch (journal + snapshot)
    if v_quest.linked_skill is not null and exists (select 1 from public.skills k where k.id = v_quest.linked_skill) then
      insert into public.skill_xp_log (user_id, skill_id, delta, source_type, source_key)
      values (v_user, v_quest.linked_skill, v_xp_awarded, 'quest', v_period_key || ':skill:self')
      on conflict do nothing;

      select parent_id into v_parent from public.skills where id = v_quest.linked_skill;
      if v_parent is not null then
        insert into public.skill_xp_log (user_id, skill_id, delta, source_type, source_key)
        values (v_user, v_parent, ceil(v_xp_awarded * 0.5)::int, 'quest', v_period_key || ':skill:parent')
        on conflict do nothing;
      end if;

      -- Snapshots = ledger sums (authoritative, idempotent, covers leaf + parent)
      insert into public.user_skills (user_id, skill_id, xp)
      select l.user_id, l.skill_id, l.v from
        (select skill_id, sum(delta)::int v from public.skill_xp_log
         where user_id = v_user and skill_id in (v_quest.linked_skill, coalesce(v_parent, v_quest.linked_skill))
         group by skill_id) l
      on conflict (user_id, skill_id) do update set xp = excluded.xp, updated_at = now();
    end if;
  end if;

  -- Level snapshot from lifetime XP (single source of truth)
  select coalesce(sum(amount), 0) into v_total from public.xp_transactions where user_id = v_user;
  v_level := public.level_from_xp(v_total);
  v_next_needed := greatest(0, public.xp_for_level(v_level + 1) - v_total);

  insert into public.user_levels (user_id, level, xp)
  values (v_user, v_level, v_total)
  on conflict (user_id) do update set level = excluded.level, xp = excluded.xp;

  return jsonb_build_object(
    'ok', true,
    'already_completed', false,
    'xp_awarded', v_xp_awarded,
    'xp_total', v_total,
    'level', v_level,
    'xp_to_next', v_next_needed,
    'milestone_updated', v_milestone_updated,
    'streak', v_new_streak
  );
end;
$$;
