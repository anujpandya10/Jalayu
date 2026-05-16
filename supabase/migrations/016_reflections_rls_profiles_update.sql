-- Fix profiles UPDATE RLS (WITH CHECK) and reflections policies for upserts

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "Users manage own reflections" on public.reflections;
create policy "Users manage own reflections"
  on public.reflections for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
