-- Anonymous pattern store: what scenarios people went through, what helped
create table if not exists community_patterns (
  id uuid primary key default gen_random_uuid(),
  -- detected scenario tags (e.g. ['job_loss', 'identity_crisis', 'financial_anxiety'])
  scenario_tags text[] not null default '{}',
  -- free-text description of the situation (anonymized, no PII)
  situation_summary text,
  -- what the AI recommended
  advice_given text,
  -- outcome signals (populated after the fact)
  mood_delta integer,           -- mood change in next 48h (-4 to +4)
  tasks_completed_next_day integer,
  user_came_back boolean,       -- did they return within 3 days
  -- life chapter at time of detection
  life_chapter text,
  -- rough demographic context (no user ID, no name)
  day_on_platform integer,      -- day N of their journey (bucketed: 1-7, 8-30, 31-90, 91+)
  created_at timestamptz default now()
);

-- No user_id — fully anonymous by design
-- Index for similarity lookup by tags
create index if not exists community_patterns_tags_idx on community_patterns using gin(scenario_tags);
create index if not exists community_patterns_chapter_idx on community_patterns(life_chapter);
create index if not exists community_patterns_outcome_idx on community_patterns(mood_delta, user_came_back);

alter table profiles add column if not exists detected_scenarios text[] default '{}';
alter table profiles add column if not exists scenario_updated_at timestamptz;
