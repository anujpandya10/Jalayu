-- ════════════════════════════════════════════════════════════════════════════
-- 021: NOTE REVISIONS — version history for notes
-- ════════════════════════════════════════════════════════════════════════════
--
-- Every time a note is updated (manual edit or AI), we snapshot the PREVIOUS
-- state into note_revisions. The user can browse history and restore any
-- prior version. We keep the last 30 revisions per note (auto-prune older).
--
-- Restoring: server snapshots the CURRENT state first, then writes the
-- selected revision's body back into notes. So "undo" is always one click,
-- and even a wrong restore can itself be undone.

create table if not exists public.note_revisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  note_id uuid references public.notes(id) on delete cascade not null,
  -- Snapshot of the note's state BEFORE the update that triggered this revision
  content text not null,
  body_md text,
  attachments jsonb,
  -- Who made the change that triggered this snapshot:
  --   'user'    — manual save in the Notes editor
  --   'ai'      — AI update_note tool call from chat / command palette
  --   'compose' — AI compose tool created/overwrote the note
  --   'restore' — user restored an older revision
  updated_by text not null default 'user',
  -- Optional: what the user asked (for AI edits)
  source text,
  created_at timestamptz not null default now()
);

alter table public.note_revisions enable row level security;

drop policy if exists "Users manage own note revisions" on public.note_revisions;
create policy "Users manage own note revisions"
  on public.note_revisions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists idx_note_revisions_note_created
  on public.note_revisions(note_id, created_at desc);
