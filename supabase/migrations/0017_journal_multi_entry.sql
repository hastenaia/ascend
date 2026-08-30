-- Ascend 0017 — Multi-entry daily journal (append-only)
-- Builds on 0001..0016. Additive, idempotent.
-- Goal: journals should ADD new entries instead of overwriting today's.
-- Changes from 0014/0015:
--   * Drop unique(uq_reflections_user_entry_date): users may write several
--     entries per day; each save inserts a new row instead of upserting.
--   * log_journal_entry becomes a plain INSERT (no ON CONFLICT DO UPDATE).
--   * +12 XP / stats / momentum stay capped at once per day via the existing
--     unique index uq_xp_source_key on xp_transactions(user_id, source_key)
--     with source_key = 'journal:YYYY-MM-DD'. Later same-day entries are just
--     history rows (no XP, no recovery repeat — log_recovery is per-day idempotent).

-- Remove one-entry-per-day constraint (keep non-unique reverse-date index)
drop index if exists uq_reflections_user_entry_date;
create index if not exists idx_reflections_user_entry_date on public.reflections(user_id, entry_date desc) where entry_date is not null;
create index if not exists idx_reflections_quest on public.reflections(quest_id) where quest_id is not null;

-- Recreate log_journal_entry: always insert a new row; XP once per day.
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

  -- Append a new entry row (never overwrite an earlier one today)
  insert into public.reflections (user_id, phase_id, quest_id, entry_date, body, learnings, worked, didnt_work, change_plan, mood, tags)
  values (v_user, p_phase_id, p_quest_id, v_date, v_body, nullif(btrim(p_learnings),''), nullif(btrim(p_worked),''), nullif(btrim(p_didnt_work),''), nullif(btrim(p_change_plan),''), p_mood, coalesce(v_trimmed_tags, '{}'))
  returning id into v_reflection_id;

  -- XP/stats/momentum awarded at most once per day: the unique index on
  -- xp_transactions(user_id, source_key) blocks the second same-day award.
  if v_should_award then
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
      -- Recovery credit for today (idempotent per day + kind)
      perform public.log_recovery('reflection');
    end if;
  end if;

  -- Keep level snapshot fresh
  select coalesce(sum(amount),0) into v_total from public.xp_transactions where user_id = v_user;
  v_level := public.level_from_xp(v_total);
  v_next_needed := greatest(0, public.xp_for_level(v_level + 1) - v_total);
  insert into public.user_levels (user_id, level, xp) values (v_user, v_level, v_total) on conflict (user_id) do update set level = excluded.level, xp = excluded.xp;

  return jsonb_build_object('ok', true, 'id', v_reflection_id, 'is_new', true, 'xp_awarded', v_xp_awarded, 'xp_total', v_total, 'level', v_level, 'xp_to_next', v_next_needed, 'date', v_date);
end;
$$;

revoke execute on function public.log_journal_entry(date, text, text, text, text, text, text, text[], uuid, uuid) from anon;
grant execute on function public.log_journal_entry(date, text, text, text, text, text, text, text[], uuid, uuid) to authenticated;