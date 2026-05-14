-- Jalayu Database Schema
-- Run this in your Supabase SQL editor

-- ─── PROFILES ───────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  full_name text,
  nickname text,
  avatar_url text,
  work_type text check (work_type in ('brain', 'hands', 'people', 'create', 'build', 'learn')),
  day_structure text,
  wake_time text,
  peak_hours text,
  biggest_goal text,
  struggles text[],
  onboarding_complete boolean not null default false,
  growth_score integer not null default 0,
  streak_count integer not null default 0,
  last_active date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ─── MOODS ──────────────────────────────────────────────────────────────────
create table if not exists public.moods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  score integer not null check (score between 1 and 5),
  note text,
  time_of_day text,
  energy_level integer check (energy_level between 1 and 5),
  created_at timestamptz not null default now()
);

alter table public.moods enable row level security;

create policy "Users manage own moods"
  on public.moods for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index on public.moods(user_id, created_at desc);

-- ─── TASKS ──────────────────────────────────────────────────────────────────
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  title text not null,
  description text,
  due_date date,
  due_time text,
  completed boolean not null default false,
  completed_at timestamptz,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  skipped_count integer not null default 0,
  category text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tasks enable row level security;

create policy "Users manage own tasks"
  on public.tasks for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index on public.tasks(user_id, due_date, completed);

-- ─── NOTES ──────────────────────────────────────────────────────────────────
create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  content text not null,
  type text not null default 'note',
  tags text[],
  is_voice boolean not null default false,
  transcript text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.notes enable row level security;

create policy "Users manage own notes"
  on public.notes for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index on public.notes(user_id, created_at desc);

-- ─── REFLECTIONS ────────────────────────────────────────────────────────────
create table if not exists public.reflections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  date date not null,
  one_word text,
  tomorrow_note text,
  win_of_day text,
  grateful_for text,
  mood_score integer check (mood_score between 1 and 5),
  energy_score integer check (energy_score between 1 and 5),
  created_at timestamptz not null default now(),
  unique(user_id, date)
);

alter table public.reflections enable row level security;

create policy "Users manage own reflections"
  on public.reflections for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index on public.reflections(user_id, date desc);

-- ─── INSIGHTS ───────────────────────────────────────────────────────────────
create table if not exists public.insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  type text not null,
  title text not null,
  content text not null,
  is_read boolean not null default false,
  priority text,
  data jsonb,
  created_at timestamptz not null default now()
);

alter table public.insights enable row level security;

create policy "Users manage own insights"
  on public.insights for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index on public.insights(user_id, is_read, created_at desc);

-- ─── REMINDERS ──────────────────────────────────────────────────────────────
create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  title text not null,
  description text,
  remind_at timestamptz not null default now(),
  days_of_week text[],
  is_active boolean not null default true,
  last_sent timestamptz,
  type text,
  created_at timestamptz not null default now()
);

alter table public.reminders enable row level security;

create policy "Users manage own reminders"
  on public.reminders for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ─── ACTIVITY LOGS ──────────────────────────────────────────────────────────
create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  date date not null,
  app_category text,
  duration_minutes integer,
  focus_score integer,
  distraction_count integer,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.activity_logs enable row level security;

create policy "Users manage own activity logs"
  on public.activity_logs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index on public.activity_logs(user_id, date desc);
