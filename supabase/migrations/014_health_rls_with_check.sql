-- Ensure health tables allow insert/update for the owning user (RLS WITH CHECK)

drop policy if exists "Users own health profile" on health_profiles;
create policy "Users own health profile"
  on health_profiles for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users own medications" on medications;
create policy "Users own medications"
  on medications for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users own medication logs" on medication_logs;
create policy "Users own medication logs"
  on medication_logs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users own health appointments" on health_appointments;
create policy "Users own health appointments"
  on health_appointments for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users own medical records" on medical_records;
create policy "Users own medical records"
  on medical_records for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
