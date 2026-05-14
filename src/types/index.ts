export interface Profile {
  id: string
  full_name: string | null
  nickname: string | null
  avatar_url: string | null
  work_type: string | null
  day_structure: string | null
  wake_time: string | null
  peak_hours: string | null
  biggest_goal: string | null
  struggles: string[] | null
  onboarding_complete: boolean
  growth_score: number
  streak_count: number
  last_active: string | null
  created_at: string
  updated_at: string
}

export interface Mood {
  id: string
  user_id: string
  score: number
  note: string | null
  time_of_day: string | null
  energy_level: number | null
  created_at: string
}

export interface Task {
  id: string
  user_id: string
  title: string
  description: string | null
  due_date: string | null
  due_time: string | null
  completed: boolean
  completed_at: string | null
  priority: 'low' | 'medium' | 'high'
  skipped_count: number
  category: string | null
  created_at: string
  updated_at: string
}

export interface Note {
  id: string
  user_id: string
  content: string
  type: string
  tags: string[] | null
  is_voice: boolean
  transcript: string | null
  created_at: string
  updated_at: string
}

export interface Reflection {
  id: string
  user_id: string
  date: string
  one_word: string | null
  tomorrow_note: string | null
  win_of_day: string | null
  grateful_for: string | null
  mood_score: number | null
  energy_score: number | null
  created_at: string
}

export interface Insight {
  id: string
  user_id: string
  type: string
  title: string
  content: string
  is_read: boolean
  priority: string | null
  data: Record<string, unknown> | null
  created_at: string
}

export interface Reminder {
  id: string
  user_id: string
  title: string
  description: string | null
  remind_at: string
  days_of_week: string[] | null
  is_active: boolean
  last_sent: string | null
  type: string | null
  created_at: string
}

export interface ActivityLog {
  id: string
  user_id: string
  date: string
  app_category: string | null
  duration_minutes: number | null
  focus_score: number | null
  distraction_count: number | null
  notes: string | null
  created_at: string
}

export type WorkType =
  | 'brain'
  | 'hands'
  | 'people'
  | 'create'
  | 'build'
  | 'learn'

export type StruggleKey =
  | 'forget'
  | 'energy'
  | 'mood'
  | 'time'
  | 'mistakes'
  | 'misunderstood'

export interface OnboardingData {
  work_type: string
  struggles: string[]
  wake_time: string
  peak_hours: string
  day_structure: string
  biggest_goal: string
  nickname: string
}
