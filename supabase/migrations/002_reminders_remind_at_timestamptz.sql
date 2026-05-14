-- Safe upgrade: only convert legacy `time` column (older installs) to timestamptz.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'reminders'
      and column_name = 'remind_at'
      and data_type = 'time without time zone'
  ) then
    alter table public.reminders
      alter column remind_at type timestamptz
      using ((current_date + remind_at::time)::timestamptz);
  end if;
end $$;
