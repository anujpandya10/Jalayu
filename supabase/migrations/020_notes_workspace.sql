-- ════════════════════════════════════════════════════════════════════════════
-- 020: NOTES WORKSPACE — folders, markdown bodies, file attachments
-- ════════════════════════════════════════════════════════════════════════════
--
-- Turns the notes feature into a full personal workspace:
--   • parent_id  → folder hierarchy (folders are notes with is_folder=true)
--   • body_md    → long-form markdown content (existing `content` stays for
--                  short-note compatibility + folder names)
--   • attachments → JSONB array of { path, name, size, mime, uploaded_at }
--
-- File attachments live in Supabase Storage under path:
--     <user_id>/<note_id>/<uuid>-<filename>
--
-- Storage RLS restricts access to files where the first folder of the path
-- matches auth.uid(). Defense in depth alongside the API-level user_id checks.

-- 1. Extend notes table ──────────────────────────────────────────────────────
alter table public.notes add column if not exists parent_id uuid
  references public.notes(id) on delete cascade;
alter table public.notes add column if not exists is_folder boolean
  not null default false;
alter table public.notes add column if not exists body_md text;
alter table public.notes add column if not exists attachments jsonb
  not null default '[]'::jsonb;

create index if not exists idx_notes_parent
  on public.notes(user_id, parent_id);

-- 2. Storage bucket for attachments (private) ────────────────────────────────
insert into storage.buckets (id, name, public)
values ('note-attachments', 'note-attachments', false)
on conflict (id) do nothing;

-- 3. Storage RLS — first folder in path must match auth.uid() ────────────────
drop policy if exists "Users read own note attachments" on storage.objects;
create policy "Users read own note attachments"
  on storage.objects for select
  using (
    bucket_id = 'note-attachments'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users insert own note attachments" on storage.objects;
create policy "Users insert own note attachments"
  on storage.objects for insert
  with check (
    bucket_id = 'note-attachments'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users update own note attachments" on storage.objects;
create policy "Users update own note attachments"
  on storage.objects for update
  using (
    bucket_id = 'note-attachments'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users delete own note attachments" on storage.objects;
create policy "Users delete own note attachments"
  on storage.objects for delete
  using (
    bucket_id = 'note-attachments'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
