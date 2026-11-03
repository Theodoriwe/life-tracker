-- Only workActivity is changed, under a row lock. Permissions and RLS on
-- public.users remain authoritative (SECURITY INVOKER).
create or replace function public.merge_work_activity(p_telegram_id bigint, p_activity jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  snapshot jsonb;
  activity jsonb;
  day_entry record;
  hour_entry record;
  previous jsonb;
  hours jsonb;
  seconds bigint;
  total bigint;
  hour_total bigint;
begin
  if jsonb_typeof(p_activity) is distinct from 'object' then
    raise exception 'Activity must be an object';
  end if;
  select data into snapshot from public.users where telegram_id = p_telegram_id for update;
  if not found then raise exception 'Tracker profile not found'; end if;
  if jsonb_typeof(snapshot) is distinct from 'object' then raise exception 'Invalid profile'; end if;
  activity := case when jsonb_typeof(snapshot->'workActivity') = 'object'
    then snapshot->'workActivity' else '{}'::jsonb end;
  for day_entry in select * from jsonb_each(p_activity) loop
    if day_entry.key !~ '^\d{4}-\d{2}-\d{2}$'
      or jsonb_typeof(day_entry.value) <> 'object' then
      raise exception 'Invalid activity day';
    end if;
    perform day_entry.key::date;
    previous := coalesce(activity->day_entry.key, '{}'::jsonb);
    hours := coalesce(previous->'hours', '{}'::jsonb);
    if jsonb_typeof(hours) <> 'object' then raise exception 'Invalid stored hours'; end if;
    for hour_entry in select * from jsonb_each(coalesce(day_entry.value->'hours','{}'::jsonb)) loop
      if hour_entry.key !~ '^([0-9]|1[0-9]|2[0-3])$' or hour_entry.value::text !~ '^\d+$' then
        raise exception 'Invalid activity hour';
      end if;
      seconds := least(3600, greatest(0, (hour_entry.value::text)::bigint,
        coalesce((hours->>hour_entry.key)::bigint, 0)));
      hours := jsonb_set(hours, array[hour_entry.key], to_jsonb(seconds), true);
    end loop;
    select coalesce(sum(value::bigint),0) into hour_total from jsonb_each_text(hours);
    total := least(86400, greatest(0, coalesce((previous->>'totalSeconds')::bigint,0),
      coalesce((day_entry.value->>'totalSeconds')::bigint,0), hour_total));
    activity := jsonb_set(activity, array[day_entry.key], previous ||
      jsonb_build_object('totalSeconds',total,'hours',hours), true);
  end loop;
  update public.users set data = jsonb_set(snapshot, '{workActivity}', activity, true)
    where telegram_id = p_telegram_id;
  return activity;
end;
$$;
revoke all on function public.merge_work_activity(bigint,jsonb) from public;
grant execute on function public.merge_work_activity(bigint,jsonb) to anon, authenticated, service_role;
