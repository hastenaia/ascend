-- Ascend 0014 — Connected Daily Journaling (reusing reflections)
-- Builds on 0001..0013. Additive, idempotent.
-- Goal: daily journal that is connected to Quests / Character / Momentum / Coach
-- so entries help user improve. Reuses public.reflections (phase_id nullable)
-- with new daily columns. Awards small XP + stats (Mental/EQ) + momentum
-- recovery credit via secure RPC. One entry per user per day.

-- Extend reflections for daily journal
alter table public.reflections add column if not exists entry_date date;
alter table public.reflections add column if not exists quest_id uuid references public.quests(id) on delete set null;
alter table public.reflections add column if not exists tags text[] not null default '{}';
alter table public.reflections alter column body drop not null;
alter table public.reflections alter column body set default '';
-- mood already exists as text; add check if not exists
do $$ begin
  alter table public.reflections add constraint reflections_mood_check check (mood is null or mood in ('terrible','low','okay','good','great'));
exception when duplicate_object then null;
end $$;

-- Unique daily entry per user (allows multiple phase reflections with null entry_date)
create unique index if not exists uq_reflections_user_entry_date on public.reflections(user_id, entry_date) where entry_date is not null;
create index if not exists idx_reflections_user_entry_date on public.reflections(user_id, entry_date desc) where entry_date is not null;
create index if not exists idx_reflections_quest on public.reflections(quest_id) where quest_id is not null;

-- Stats linkage: which stat(s) journaling grows is in RPC weights below.

-- Helper to return today in DB timezone (use current_date)
-- log_journal_entry: secure daily journal upsert + XP/stats/momentum
-- Awards: 12 XP (small, honest), Mental 0.7 + EQ 0.3 split (round), momentum recovery reflection kind
create or replace function public.log_journal_entry(
  p_entry_date date,
  p_body text,
  p_learnings text,
  p_worked text,
  p_didnt_work text,
  p_change_plan text,
  p_mood text,
  p_tags text[],
  p_phase_id uuid,
  p_quest_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_date date := coalesce(p_entry_date, current_date);
  v_body text;
  v_xp int := 12;
  v_period_key text;
  v_total bigint := 0;
  v_level int := 1;
  v_next_needed bigint := 0;
  v_reflection_id uuid;
  v_is_new boolean := false;
  v_xp_awarded int := 0;
  v_pts int;
  r record;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  if p_mood is not null and p_mood not in ('terrible','low','okay','good','great') then
    return jsonb_build_object('ok', false, 'error', 'invalid_mood');
  end if;

  -- Validate phase ownership if provided
  if p_phase_id is not null and not exists (select 1 from public.phases where id = p_phase_id and user_id = v_user) then
    return jsonb_build_object('ok', false, 'error', 'phase_not_found');
  end if;

  -- Validate quest ownership if provided
  if p_quest_id is not null and not exists (select 1 from public.quests where id = p_quest_id and user_id = v_user) then
    return jsonb_build_object('ok', false, 'error', 'quest_not_found');
  end if;

  -- Build canonical body if empty
  v_body := coalesce(nullif(btrim(p_body), ''), '');
  if v_body = '' then
    v_body := trim(concat_ws(E'\n\n',
      case when btrim(coalesce(p_learnings,'')) <> '' then 'What I learned:' || E'\n' || btrim(p_learnings) else '' end,
      case when btrim(coalesce(p_worked,'')) <> '' then 'What worked:' || E'\n' || btrim(p_worked) else '' end,
      case when btrim(coalesce(p_didnt_work,'')) <> '' then 'What didn''t work:' || E'\n' || btrim(p_didnt_work) else '' end,
      case when btrim(coalesce(p_change_plan,'')) <> '' then 'What I will change:' || E'\n' || btrim(p_change_plan) else '' end
    ));
    if btrim(v_body) = '' then
      return jsonb_build_object('ok', false, 'error', 'empty_entry');
    end if;
  end if;

  if char_length(v_body) > 5000 then
    return jsonb_build_object('ok', false, 'error', 'body_too_long');
  end if;

  -- Upsert daily journal row
  insert into public.reflections (user_id, phase_id, quest_id, entry_date, body, learnings, worked, didnt_work, change_plan, mood, tags)
  values (v_user, p_phase_id, p_quest_id, v_date, v_body, nullif(btrim(p_learnings),''), nullif(btrim(p_worked),''), nullif(btrim(p_didnt_work),''), nullif(btrim(p_change_plan),''), p_mood, coalesce(p_tags, '{}'))
  on conflict (user_id, entry_date) where entry_date is not null
  do update set body = excluded.body, learnings = excluded.learnings, worked = excluded.worked, didnt_work = excluded.didnt_work, change_plan = excluded.change_plan, mood = excluded.mood, tags = excluded.tags, phase_id = coalesce(excluded.phase_id, public.reflections.phase_id), quest_id = coalesce(excluded.quest_id, public.reflections.quest_id), updated_at = now()
  returning id, (xmax = 0) into v_reflection_id, v_is_new;

  -- Only award XP/stats/momentum on first creation that day (not on edits)
  if v_is_new then
    v_period_key := 'journal:' || v_date::text;

    begin
      insert into public.xp_transactions (user_id, amount, source, source_type, source_id, source_key, description)
      values (v_user, v_xp, 'journal:' || v_date::text, 'quest', v_reflection_id, v_period_key, 'Daily journal ' || v_date::text);
      v_xp_awarded := v_xp;
    exception when unique_violation then
      v_xp_awarded := 0;
    end;

    if v_xp_awarded > 0 then
      -- Stats: Mental 70%, EQ 30% (emotional-intelligence slug)
      for r in select * from (values ('mental', 0.70), ('emotional-intelligence', 0.30)) as t(slug, weight) loop
        v_pts := round(v_xp_awarded * r.weight);
        if v_pts > 0 then
          insert into public.stat_history (user_id, stat_id, delta, source_type, source_id, description, source_key)
          select v_user, s.id, v_pts, 'quest', v_reflection_id, 'Journal ' || v_date::text, v_period_key || ':stat:' || s.slug
          from public.stats s where s.slug = r.slug
          on conflict do nothing;

          insert into public.user_stats (user_id, stat_id, value)
          select v_user, s.id, (select coalesce(sum(h.delta),0)::numeric from public.stat_history h where h.user_id = v_user and h.stat_id = s.id)
          from public.stats s where s.slug = r.slug
          on conflict (user_id, stat_id) do update set value = excluded.value, updated_at = now();
        end if;
      end loop;
    end if;

    -- Momentum recovery credit (reflection kind) — always, even if XP dup? Only on new
    perform public.log_recovery('reflection');

    select coalesce(sum(amount),0) into v_total from public.xp_transactions where user_id = v_user;
    v_level := public.level_from_xp(v_total);
    v_next_needed := greatest(0, public.xp_for_level(v_level + 1) - v_total);
    insert into public.user_levels (user_id, level, xp) values (v_user, v_level, v_total) on conflict (user_id) do update set level = excluded.level, xp = excluded.xp;
  else
    select coalesce(sum(amount),0) into v_total from public.xp_transactions where user_id = v_user;
    v_level := public.level_from_xp(v_total);
    v_next_needed := greatest(0, public.xp_for_level(v_level + 1) - v_total);
  end if;

  return jsonb_build_object('ok', true, 'id', v_reflection_id, 'is_new', v_is_new, 'xp_awarded', v_xp_awarded, 'xp_total', v_total, 'level', v_level, 'xp_to_next', v_next_needed, 'date', v_date);
end;
$$;

revoke execute on function public.log_journal_entry(date, text, text, text, text, text, text, text[], uuid, uuid) from anon;
grant execute on function public.log_journal_entry(date, text, text, text, text, text, text, text[], uuid, uuid) to authenticated;

-- Ensure stats for journal exist (mental, emotional-intelligence already seeded in 0005)
