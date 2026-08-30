-- Ascend 0015 — Fix P0 integrity per Ascend decisions
-- Builds on 0001..0014. Additive, idempotent.

-- 1) Fix reflections.body default/check drift (0014 set DEFAULT '' violates 0001 CHECK 1..5000)
do $$ begin
  alter table public.reflections alter column body set default '';
exception when others then null; end $$;

-- Drop old body check if exists (generated name) and replace with permissive null-or-range
do $$ declare r record; begin
  for r in select conname from pg_constraint where conrelid='public.reflections'::regclass and contype='c' and pg_get_constraintdef(oid) like '%char_length(body)%' loop
    execute format('alter table public.reflections drop constraint %I', r.conname);
  end loop;
end $$;
alter table public.reflections add constraint reflections_body_check check (body is null or body = '' or char_length(body) between 1 and 5000);

-- Ensure mood check exists (defensive)
do $$ begin
  alter table public.reflections add constraint reflections_mood_check2 check (mood is null or mood in ('terrible','low','okay','good','great'));
exception when duplicate_object then null; end $$;

-- 2) Harden tags: already text[] default '{}', add check via trigger-like constraint (array length + element length)
-- Use check constraint with helper: array_length(tags,1) <=8 and each element <=24 and not empty after trim
-- Postgres check cannot easily loop, so enforce via function
create or replace function public.check_reflection_tags(p_tags text[]) returns boolean language sql immutable as $$
  select
    p_tags is null
    or coalesce(array_length(p_tags,1),0) <= 8
    and not exists (select 1 from unnest(p_tags) t where btrim(t) = '' or char_length(btrim(t)) > 24)
    and (select count(*) from (select distinct btrim(unnest(p_tags)) ) s) = coalesce(array_length(p_tags,1),0)
$$;
do $$ begin
  alter table public.reflections add constraint reflections_tags_check check (public.check_reflection_tags(tags));
exception when duplicate_object then null; end $$;

-- 3) Re-create log_journal_entry with Ascend decisions:
-- - Reject future dates
-- - +12 XP only if v_date = current_date (today), 0 otherwise
-- - Per-field length checks (1500 each)
-- - Tags validation
-- - v_date-aware recovery credit
-- - Body default '' handled, but empty body now allowed for structured entries
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
  v_should_award boolean := false;
  v_period_key text;
  v_total bigint := 0;
  v_level int := 1;
  v_next_needed bigint := 0;
  v_reflection_id uuid;
  v_is_new boolean := false;
  v_xp_awarded int := 0;
  v_pts int;
  r record;
  v_trimmed_tags text[];
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  if p_mood is not null and p_mood not in ('terrible','low','okay','good','great') then
    return jsonb_build_object('ok', false, 'error', 'invalid_mood');
  end if;

  if v_date > current_date then
    return jsonb_build_object('ok', false, 'error', 'future_entry_not_allowed');
  end if;

  -- Per-field length 1500
  if char_length(coalesce(p_learnings,'')) > 1500 then return jsonb_build_object('ok', false, 'error', 'learnings_too_long'); end if;
  if char_length(coalesce(p_worked,'')) > 1500 then return jsonb_build_object('ok', false, 'error', 'worked_too_long'); end if;
  if char_length(coalesce(p_didnt_work,'')) > 1500 then return jsonb_build_object('ok', false, 'error', 'didnt_work_too_long'); end if;
  if char_length(coalesce(p_change_plan,'')) > 1500 then return jsonb_build_object('ok', false, 'error', 'change_plan_too_long'); end if;
  if p_tags is not null then
    if coalesce(array_length(p_tags,1),0) > 8 then return jsonb_build_object('ok', false, 'error', 'too_many_tags'); end if;
    v_trimmed_tags := array(select btrim(t) from unnest(p_tags) t);
    if exists (select 1 from unnest(v_trimmed_tags) t where t = '' or char_length(t) > 24) then
      return jsonb_build_object('ok', false, 'error', 'invalid_tag');
    end if;
    if (select count(*) from (select distinct unnest(v_trimmed_tags) ) s) != coalesce(array_length(v_trimmed_tags,1),0) then
      return jsonb_build_object('ok', false, 'error', 'duplicate_tags');
    end if;
  end if;

  if p_phase_id is not null and not exists (select 1 from public.phases where id = p_phase_id and user_id = v_user) then
    return jsonb_build_object('ok', false, 'error', 'phase_not_found');
  end if;
  if p_quest_id is not null and not exists (select 1 from public.quests where id = p_quest_id and user_id = v_user) then
    return jsonb_build_object('ok', false, 'error', 'quest_not_found');
  end if;

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

  v_should_award := (v_date = current_date);

  -- Upsert daily journal row
  insert into public.reflections (user_id, phase_id, quest_id, entry_date, body, learnings, worked, didnt_work, change_plan, mood, tags)
  values (v_user, p_phase_id, p_quest_id, v_date, v_body, nullif(btrim(p_learnings),''), nullif(btrim(p_worked),''), nullif(btrim(p_didnt_work),''), nullif(btrim(p_change_plan),''), p_mood, coalesce(v_trimmed_tags, '{}'))
  on conflict (user_id, entry_date) where entry_date is not null
  do update set body = excluded.body, learnings = excluded.learnings, worked = excluded.worked, didnt_work = excluded.didnt_work, change_plan = excluded.change_plan, mood = excluded.mood, tags = excluded.tags, phase_id = coalesce(excluded.phase_id, public.reflections.phase_id), quest_id = coalesce(excluded.quest_id, public.reflections.quest_id), updated_at = now()
  returning id, (xmax = 0) into v_reflection_id, v_is_new;

  if v_is_new and v_should_award then
    v_period_key := 'journal:' || v_date::text;
    begin
      insert into public.xp_transactions (user_id, amount, source, source_type, source_id, source_key, description)
      values (v_user, v_xp, 'journal:' || v_date::text, 'quest', v_reflection_id, v_period_key, 'Daily journal ' || v_date::text);
      v_xp_awarded := v_xp;
    exception when unique_violation then
      v_xp_awarded := 0;
    end;

    if v_xp_awarded > 0 then
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
    -- Recovery credit for today only
    perform public.log_recovery('reflection');
    select coalesce(sum(amount),0) into v_total from public.xp_transactions where user_id = v_user;
    v_level := public.level_from_xp(v_total);
    v_next_needed := greatest(0, public.xp_for_level(v_level + 1) - v_total);
    insert into public.user_levels (user_id, level, xp) values (v_user, v_level, v_total) on conflict (user_id) do update set level = excluded.level, xp = excluded.xp;
  else
    -- Back-dated edit or back-dated new entry: no XP/stats/recovery, just level snapshot
    select coalesce(sum(amount),0) into v_total from public.xp_transactions where user_id = v_user;
    v_level := public.level_from_xp(v_total);
    v_next_needed := greatest(0, public.xp_for_level(v_level + 1) - v_total);
  end if;

  return jsonb_build_object('ok', true, 'id', v_reflection_id, 'is_new', v_is_new, 'xp_awarded', v_xp_awarded, 'xp_total', v_total, 'level', v_level, 'xp_to_next', v_next_needed, 'date', v_date);
end;
$$;

revoke execute on function public.log_journal_entry(date, text, text, text, text, text, text, text[], uuid, uuid) from anon;
grant execute on function public.log_journal_entry(date, text, text, text, text, text, text, text[], uuid, uuid) to authenticated;
