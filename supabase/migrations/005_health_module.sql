-- 005_health_module.sql
-- Full health module: insurance profile, medications, logs, appointments, medical records

-- ── Health Profile (insurance + primary care + medical history) ──────────────
CREATE TABLE IF NOT EXISTS health_profiles (
  id                       uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id                  uuid    REFERENCES profiles(id) ON DELETE CASCADE NOT NULL UNIQUE,

  -- Insurance
  insurance_carrier        text,
  plan_name                text,
  plan_type                text,          -- 'HMO' | 'PPO' | 'EPO' | 'HDHP' | 'Medicare' | 'Medicaid'
  member_id                text,
  group_number             text,
  deductible_cents         integer,       -- annual deductible in cents (avoid floats)
  deductible_met_cents     integer DEFAULT 0,
  out_of_pocket_max_cents  integer,
  copay_primary_cents      integer,
  copay_specialist_cents   integer,
  copay_er_cents           integer,
  insurance_phone          text,
  insurance_website        text,

  -- Primary care
  primary_care_name        text,
  primary_care_phone       text,
  primary_care_address     text,
  primary_care_fax         text,

  -- Medical history
  conditions               text[],
  allergies                text[],
  blood_type               text,
  notes                    text,

  created_at  timestamptz DEFAULT now() NOT NULL,
  updated_at  timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE health_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own health profile"
  ON health_profiles FOR ALL
  USING (auth.uid() = user_id);

-- ── Medications ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS medications (
  id           uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      uuid    REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  name         text    NOT NULL,
  dosage_mg    numeric,
  frequency    text,          -- '1x daily' | '2x daily' | 'as needed' | 'weekly' | etc.
  prescriber   text,
  purpose      text,
  start_date   date,
  end_date     date,          -- NULL = currently active
  is_active    boolean DEFAULT true NOT NULL,
  notes        text,
  created_at   timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE medications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own medications"
  ON medications FOR ALL
  USING (auth.uid() = user_id);

-- ── Medication Logs (track when each dose was taken) ─────────────────────────
CREATE TABLE IF NOT EXISTS medication_logs (
  id             uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id        uuid    REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  medication_id  uuid    REFERENCES medications(id) ON DELETE CASCADE NOT NULL,
  taken_at       timestamptz DEFAULT now() NOT NULL,
  dose_mg        numeric,
  notes          text
);

ALTER TABLE medication_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own medication logs"
  ON medication_logs FOR ALL
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS medication_logs_user_date
  ON medication_logs (user_id, taken_at DESC);

-- ── Health Appointments ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS health_appointments (
  id               uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          uuid    REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  title            text    NOT NULL,
  provider_name    text,
  appointment_date timestamptz NOT NULL,
  location         text,
  reason           text,
  notes            text,
  follow_up_needed boolean DEFAULT false,
  created_at       timestamptz DEFAULT now() NOT NULL,
  updated_at       timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE health_appointments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own health appointments"
  ON health_appointments FOR ALL
  USING (auth.uid() = user_id);

-- ── Medical Records (references Supabase Storage) ────────────────────────────
CREATE TABLE IF NOT EXISTS medical_records (
  id           uuid  DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      uuid  REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  title        text  NOT NULL,
  record_type  text  NOT NULL,  -- 'lab' | 'imaging' | 'prescription' | 'visit_summary' | 'other'
  record_date  date,
  file_url     text,            -- Supabase Storage public URL
  file_name    text,
  notes        text,
  created_at   timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE medical_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own medical records"
  ON medical_records FOR ALL
  USING (auth.uid() = user_id);
