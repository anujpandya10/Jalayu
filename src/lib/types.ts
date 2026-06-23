export interface Profile {
  id: string
  created_at: string
  updated_at: string
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
  preferred_language: string | null  // BCP-47, e.g. 'en', 'es', 'hi', 'ar'
  phone: string | null
  contact_email: string | null
  address_line1: string | null
  address_line2: string | null
  city: string | null
  state: string | null
  postal_code: string | null
  country: string | null
  dashboard_layout: Record<string, unknown> | null
  // Onboarding v2 (027) — richer signal for the shadow agent
  pronouns: string | null
  life_stage: string | null
  help_domains: string[] | null
  voice_prefs: string[] | null
  boundaries: string | null
  profile_notes: ProfileNote[] | null
  last_deepening_at: string | null
}

export interface ProfileNote {
  asked_at: string
  prompt: string
  answer: string
  source: 'letter' | 'onboarding' | 'manual'
}

export interface Mood {
  id: string
  user_id: string
  created_at: string
  score: number
  note: string | null
  time_of_day: string | null
  energy_level: number | null
}

export interface Task {
  id: string
  user_id: string
  created_at: string
  updated_at: string
  title: string
  description: string | null
  due_date: string | null
  due_time: string | null
  completed: boolean
  completed_at: string | null
  priority: 'low' | 'medium' | 'high'
  skipped_count: number
  category: string | null
  event_type: string | null  // 'task' | 'event' | 'birthday' | 'meeting'
}

export interface Note {
  id: string
  user_id: string
  created_at: string
  updated_at: string
  content: string
  type: string
  tags: string[] | null
  is_voice: boolean
  transcript: string | null
  meta?: Record<string, unknown> | null
}

export interface Reflection {
  id: string
  user_id: string
  created_at: string
  date: string
  one_word: string | null
  tomorrow_note: string | null
  win_of_day: string | null
  grateful_for: string | null
  mood_score: number | null
  energy_score: number | null
}

export interface Insight {
  id: string
  user_id: string
  created_at: string
  type: string
  title: string
  content: string
  is_read: boolean
  priority: string | null
  data: Record<string, unknown> | null
}

export interface Reminder {
  id: string
  user_id: string
  created_at: string
  title: string
  description: string | null
  remind_at: string
  days_of_week: string[] | null
  is_active: boolean
  last_sent: string | null
  type: string | null
}

export interface ActivityLog {
  id: string
  user_id: string
  created_at: string
  date: string
  app_category: string | null
  duration_minutes: number | null
  focus_score: number | null
  distraction_count: number | null
  notes: string | null
}

export interface ChatMsg {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

// ── Health Module ─────────────────────────────────────────────────────────────

export interface HealthProfile {
  id: string
  user_id: string
  created_at: string
  updated_at: string
  // Profile identity
  profile_label: string | null    // 'Mine', 'Spouse', 'Child - Emma', etc.
  relationship: string | null     // 'self' | 'spouse' | 'child' | 'parent' | 'other'
  // Insurance
  insurance_carrier: string | null
  plan_name: string | null
  plan_type: string | null         // 'HMO' | 'PPO' | 'EPO' | 'HDHP' | 'Medicare' | 'Medicaid'
  member_id: string | null
  group_number: string | null
  deductible_cents: number | null
  deductible_met_cents: number | null
  out_of_pocket_max_cents: number | null
  copay_primary_cents: number | null
  copay_specialist_cents: number | null
  copay_er_cents: number | null
  insurance_phone: string | null
  insurance_website: string | null
  // Primary care
  primary_care_name: string | null
  primary_care_phone: string | null
  primary_care_address: string | null
  primary_care_fax: string | null
  // Medical history
  conditions: string[] | null
  allergies: string[] | null
  blood_type: string | null
  notes: string | null
}

export interface Medication {
  id: string
  user_id: string
  created_at: string
  name: string
  dosage_mg: number | null
  frequency: string | null
  prescriber: string | null
  purpose: string | null
  start_date: string | null
  end_date: string | null      // null = currently active
  is_active: boolean
  notes: string | null
}

export interface MedicationLog {
  id: string
  user_id: string
  medication_id: string
  taken_at: string
  dose_mg: number | null
  notes: string | null
}

export interface HealthAppointment {
  id: string
  user_id: string
  created_at: string
  updated_at: string
  title: string
  provider_name: string | null
  appointment_date: string
  location: string | null
  reason: string | null
  notes: string | null
  follow_up_needed: boolean
}

export interface MedicalRecord {
  id: string
  user_id: string
  created_at: string
  title: string
  record_type: string   // 'lab' | 'imaging' | 'prescription' | 'visit_summary' | 'other'
  record_date: string | null
  file_url: string | null
  file_name: string | null
  notes: string | null
}

// ── Navigation ────────────────────────────────────────────────────────────────

export type SidebarView =
  | 'dashboard'
  | 'calendar'
  | 'reminders'
  | 'mind'
  | 'notes'
  | 'vault'
  | 'progress'
  | 'wellness'
  | 'learning'
  | 'memory'
  | 'meetings'
  | 'people'
  | 'widgets'
  | 'insights'
  | 'health'
  | 'trading'
  | 'academy'
  | 'strategylab'
  | 'settings'

export type JourneyView = 'day1' | 'day2' | 'day7' | 'day30'
