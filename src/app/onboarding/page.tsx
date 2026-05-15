'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { createClient } from '@/lib/supabase'
import toast, { Toaster } from 'react-hot-toast'
import { Loader2, ShieldCheck, ChevronLeft } from 'lucide-react'

const TOTAL_STEPS = 6

const WORK_TYPES = [
  { key: 'brain', emoji: '💻', label: 'I work with a computer', sub: 'Software, data, writing, research' },
  { key: 'hands', emoji: '🔧', label: 'I work with my hands', sub: 'Trades, construction, crafts' },
  { key: 'people', emoji: '🩺', label: 'I work with people', sub: 'Healthcare, teaching, service' },
  { key: 'create', emoji: '🎨', label: 'I create things', sub: 'Design, art, music, content' },
  { key: 'build', emoji: '🏢', label: 'I run something', sub: 'Business, team, organization' },
  { key: 'learn', emoji: '📚', label: 'I am learning', sub: 'Student, self-educator, explorer' },
]

const STRUGGLES = [
  { key: 'forget', emoji: '🧠', label: 'I forget things constantly' },
  { key: 'energy', emoji: '🔋', label: 'I run out of energy before my day ends' },
  { key: 'mood', emoji: '🌊', label: 'My mood affects everything I do' },
  { key: 'time', emoji: '⏰', label: 'There\'s never enough time' },
  { key: 'mistakes', emoji: '🔁', label: 'I keep making the same mistakes' },
  { key: 'misunderstood', emoji: '💬', label: 'Nobody really gets me' },
]

const WAKE_TIMES = ['Before 6am', '6–7am', '7–9am', 'After 9am', 'Night owl']
const PEAK_TIMES = ['Early morning', 'Late morning', 'Afternoon', 'Evening', 'Late night']
const STRUCTURES = ['Very structured', 'Somewhat structured', 'Pretty chaotic', 'Completely unpredictable']

const variants = {
  enter: { opacity: 0, x: 40 },
  center: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -40 },
}

export default function OnboardingPage() {
  const [step, setStep] = useState(0)
  const [workType, setWorkType] = useState('')
  const [struggles, setStruggles] = useState<string[]>([])
  const [wakeTime, setWakeTime] = useState('')
  const [peakHours, setPeakHours] = useState('')
  const [dayStructure, setDayStructure] = useState('')
  const [biggestGoal, setBiggestGoal] = useState('')
  const [nickname, setNickname] = useState('')
  const [saving, setSaving] = useState(false)
  const router = useRouter()

  const canAdvance = () => {
    if (step === 1) return !!workType
    if (step === 2) return struggles.length > 0
    if (step === 3) return !!(wakeTime && peakHours && dayStructure)
    if (step === 4) return biggestGoal.trim().length >= 3
    return true
  }

  const toggleStruggle = (key: string) => {
    setStruggles((prev) =>
      prev.includes(key) ? prev.filter((s) => s !== key) : [...prev, key]
    )
  }

  const nextStep = () => {
    if (step < TOTAL_STEPS - 1) setStep((s) => s + 1)
  }

  const prevStep = () => {
    if (step > 0) setStep((s) => s - 1)
  }

  const handleFinish = async () => {
    if (!nickname.trim()) {
      toast.error('Please enter your name first')
      return
    }

    const supabase = createClient()
    setSaving(true)
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        router.push('/login')
        return
      }

      const { error } = await supabase.from('profiles').upsert({
        id: user.id,
        nickname: nickname.trim(),
        full_name: nickname.trim(),
        work_type: workType,
        struggles,
        wake_time: wakeTime,
        peak_hours: peakHours,
        day_structure: dayStructure,
        biggest_goal: biggestGoal.trim(),
        onboarding_complete: true,
        updated_at: new Date().toISOString(),
      })

      if (error) throw error

      router.push('/dashboard')
      router.refresh()
    } catch (err) {
      console.error(err)
      toast.error('Something went wrong saving your profile. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: 'var(--bg)' }}
    >
      <Toaster
        position="top-center"
        toastOptions={{ style: { borderRadius: '12px', fontSize: '14px' } }}
      />

      {/* Progress bar */}
      {step > 0 && (
        <div className="fixed top-0 left-0 right-0 z-10 h-1" style={{ background: 'var(--border)' }}>
          <motion.div
            className="h-full"
            style={{ background: 'var(--accent)' }}
            initial={{ width: 0 }}
            animate={{ width: `${(step / (TOTAL_STEPS - 1)) * 100}%` }}
            transition={{ type: 'spring', stiffness: 120, damping: 20 }}
          />
        </div>
      )}

      {/* Back button */}
      {step > 0 && step < TOTAL_STEPS - 1 && (
        <button
          onClick={prevStep}
          className="fixed top-4 left-4 z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all"
          style={{ color: 'var(--accent)', background: 'var(--morning)' }}
        >
          <ChevronLeft size={14} />
          Back
        </button>
      )}

      <div className="flex-1 flex flex-col items-center justify-center px-5 py-16">
        <div className="w-full max-w-lg">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ type: 'spring', stiffness: 260, damping: 28 }}
            >
              {/* STEP 0 — Welcome */}
              {step === 0 && (
                <div className="text-center">
                  <div
                    className="inline-flex items-center justify-center w-20 h-20 rounded-3xl mb-6 text-3xl"
                    style={{ background: 'var(--accent)', color: 'var(--surface)' }}
                  >
                    ✦
                  </div>
                  <h1
                    className="text-3xl font-bold mb-3 leading-tight"
                    style={{ color: 'var(--text)' }}
                  >
                    Hello. You made it here.
                  </h1>
                  <p
                    className="text-base leading-relaxed mb-8 max-w-sm mx-auto"
                    style={{ color: 'var(--text-2)' }}
                  >
                    This is not a signup form. This is the beginning of something
                    that will actually change your life.
                  </p>
                  <button
                    onClick={nextStep}
                    className="px-8 py-4 rounded-2xl font-semibold text-base transition-all"
                    style={{ background: 'var(--accent)', color: 'var(--surface)' }}
                  >
                    Let&apos;s begin →
                  </button>
                </div>
              )}

              {/* STEP 1 — Work type */}
              {step === 1 && (
                <div>
                  <AiBubble text="First, help me understand the shape of your days. What kind of work do you mostly do?" />
                  <h2
                    className="text-xl font-bold mb-1 mt-4"
                    style={{ color: 'var(--text)' }}
                  >
                    How do you spend your days?
                  </h2>
                  <p className="text-sm mb-5" style={{ color: 'var(--text-2)' }}>
                    Choose the one that fits best
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    {WORK_TYPES.map((w) => (
                      <button
                        key={w.key}
                        onClick={() => setWorkType(w.key)}
                        className="p-4 rounded-2xl text-left transition-all"
                        style={{
                          background: workType === w.key ? 'var(--morning)' : 'var(--surface)',
                          border: `1.5px solid ${workType === w.key ? 'var(--accent)' : 'var(--border)'}`,
                        }}
                      >
                        <div className="text-xl mb-1">{w.emoji}</div>
                        <div
                          className="text-sm font-semibold leading-tight"
                          style={{ color: 'var(--text)' }}
                        >
                          {w.label}
                        </div>
                        <div className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>
                          {w.sub}
                        </div>
                      </button>
                    ))}
                  </div>
                  <StepFooter canAdvance={canAdvance()} onNext={nextStep} />
                </div>
              )}

              {/* STEP 2 — Struggles */}
              {step === 2 && (
                <div>
                  <AiBubble text="Now be honest with me. What actually gets in your way? Select everything that resonates." />
                  <h2
                    className="text-xl font-bold mb-1 mt-4"
                    style={{ color: 'var(--text)' }}
                  >
                    What holds you back?
                  </h2>
                  <p className="text-sm mb-5" style={{ color: 'var(--text-2)' }}>
                    Select all that apply — no judgment here
                  </p>
                  <div className="space-y-2.5">
                    {STRUGGLES.map((s) => (
                      <button
                        key={s.key}
                        onClick={() => toggleStruggle(s.key)}
                        className="w-full p-4 rounded-2xl text-left flex items-center gap-3 transition-all"
                        style={{
                          background: struggles.includes(s.key) ? 'var(--morning)' : 'var(--surface)',
                          border: `1.5px solid ${struggles.includes(s.key) ? 'var(--accent)' : 'var(--border)'}`,
                        }}
                      >
                        <span className="text-lg">{s.emoji}</span>
                        <span
                          className="text-sm font-medium"
                          style={{ color: 'var(--text)' }}
                        >
                          {s.label}
                        </span>
                        {struggles.includes(s.key) && (
                          <span
                            className="ml-auto text-xs font-semibold px-2 py-0.5 rounded-full"
                            style={{ background: 'var(--accent)', color: 'var(--surface)' }}
                          >
                            ✓
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                  <StepFooter canAdvance={canAdvance()} onNext={nextStep} />
                </div>
              )}

              {/* STEP 3 — Day shape */}
              {step === 3 && (
                <div>
                  <AiBubble text="Understanding when you're at your best helps me support you at exactly the right moments." />
                  <h2
                    className="text-xl font-bold mb-1 mt-4"
                    style={{ color: 'var(--text)' }}
                  >
                    Shape of your day
                  </h2>
                  <p className="text-sm mb-5" style={{ color: 'var(--text-2)' }}>
                    All three are needed to understand your rhythm
                  </p>

                  <div className="space-y-5">
                    <div>
                      <p className="text-sm font-semibold mb-2.5" style={{ color: 'var(--text)' }}>
                        When do you usually wake up?
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {WAKE_TIMES.map((t) => (
                          <PillButton
                            key={t}
                            label={t}
                            selected={wakeTime === t}
                            onClick={() => setWakeTime(t)}
                          />
                        ))}
                      </div>
                    </div>

                    <div>
                      <p className="text-sm font-semibold mb-2.5" style={{ color: 'var(--text)' }}>
                        When are you most productive?
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {PEAK_TIMES.map((t) => (
                          <PillButton
                            key={t}
                            label={t}
                            selected={peakHours === t}
                            onClick={() => setPeakHours(t)}
                          />
                        ))}
                      </div>
                    </div>

                    <div>
                      <p className="text-sm font-semibold mb-2.5" style={{ color: 'var(--text)' }}>
                        How structured is your typical day?
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {STRUCTURES.map((s) => (
                          <PillButton
                            key={s}
                            label={s}
                            selected={dayStructure === s}
                            onClick={() => setDayStructure(s)}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                  <StepFooter canAdvance={canAdvance()} onNext={nextStep} />
                </div>
              )}

              {/* STEP 4 — Biggest goal */}
              {step === 4 && (
                <div>
                  <AiBubble text="Now — what's the one thing you actually want to change? Be specific. This is between you and me." />
                  <h2
                    className="text-xl font-bold mb-1 mt-4"
                    style={{ color: 'var(--text)' }}
                  >
                    Your biggest goal right now
                  </h2>
                  <p className="text-sm mb-4" style={{ color: 'var(--text-2)' }}>
                    What do you most want to achieve or change?
                  </p>
                  <textarea
                    value={biggestGoal}
                    onChange={(e) => setBiggestGoal(e.target.value)}
                    placeholder="e.g. Stop forgetting important things. Feel less overwhelmed. Actually finish what I start…"
                    rows={4}
                    className="w-full px-4 py-3 rounded-2xl text-sm resize-none transition-all"
                    style={{
                      border: '1.5px solid var(--border)',
                      background: 'var(--surface)',
                      color: 'var(--text)',
                      outline: 'none',
                      lineHeight: '1.6',
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = 'var(--accent)'
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = 'var(--border)'
                    }}
                  />
                  <div
                    className="flex items-center gap-2 mt-3 p-3 rounded-xl"
                    style={{ background: 'var(--success-bg)', border: '1px solid var(--success-border)' }}
                  >
                    <ShieldCheck size={14} style={{ color: 'var(--success-text)' }} className="shrink-0" />
                    <p className="text-xs" style={{ color: 'var(--success-text)' }}>
                      This stays completely private. Only you and your personal AI ever see it.
                    </p>
                  </div>
                  <StepFooter canAdvance={canAdvance()} onNext={nextStep} />
                </div>
              )}

              {/* STEP 5 — Name + summary */}
              {step === 5 && (
                <div>
                  <AiBubble text="Last thing. What should I call you? And then we're done — I promise this is worth it." />
                  <h2
                    className="text-xl font-bold mb-1 mt-4"
                    style={{ color: 'var(--text)' }}
                  >
                    Almost there
                  </h2>
                  <p className="text-sm mb-5" style={{ color: 'var(--text-2)' }}>
                    What name would you like Jalayu to use for you?
                  </p>
                  <input
                    type="text"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    placeholder="Your name or nickname"
                    className="w-full px-4 py-3 rounded-xl text-sm mb-5 transition-all"
                    style={{
                      border: '1.5px solid var(--border)',
                      background: 'var(--surface)',
                      color: 'var(--text)',
                      outline: 'none',
                    }}
                    onFocus={(e) => (e.target.style.borderColor = 'var(--accent)')}
                    onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
                  />

                  {/* Summary */}
                  <div
                    className="rounded-2xl p-4 mb-6 space-y-2"
                    style={{ background: 'var(--morning)', border: '1px solid var(--border-2)' }}
                  >
                    <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--accent)' }}>
                      What Jalayu learned about you
                    </p>
                    <SummaryLine
                      label="Work type"
                      value={WORK_TYPES.find((w) => w.key === workType)?.label || '—'}
                    />
                    <SummaryLine
                      label="Main struggles"
                      value={
                        struggles.length
                          ? struggles
                              .map((k) => STRUGGLES.find((s) => s.key === k)?.emoji)
                              .join(' ')
                          : '—'
                      }
                    />
                    <SummaryLine label="Wakes up" value={wakeTime || '—'} />
                    <SummaryLine label="Peak time" value={peakHours || '—'} />
                    <SummaryLine label="Day structure" value={dayStructure || '—'} />
                    <SummaryLine
                      label="Goal"
                      value={
                        biggestGoal.length > 50
                          ? biggestGoal.slice(0, 50) + '…'
                          : biggestGoal || '—'
                      }
                    />
                  </div>

                  <button
                    onClick={handleFinish}
                    disabled={saving || !nickname.trim()}
                    className="w-full py-4 rounded-2xl font-semibold text-base flex items-center justify-center gap-2 transition-all"
                    style={{
                      background: saving || !nickname.trim() ? 'var(--border-2)' : 'var(--accent)',
                      color: 'var(--surface)',
                      cursor: saving || !nickname.trim() ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {saving ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        Setting things up…
                      </>
                    ) : (
                      'Take me in ✦'
                    )}
                  </button>
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          {/* Dot indicators */}
          {step > 0 && (
            <div className="flex justify-center gap-2 mt-8">
              {Array.from({ length: TOTAL_STEPS - 1 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-full transition-all"
                  style={{
                    width: i + 1 === step ? 20 : 6,
                    height: 6,
                    background: i + 1 <= step ? 'var(--accent)' : 'var(--border)',
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function AiBubble({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-3">
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-bold"
        style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
      >
        ✦
      </div>
      <div
        className="flex-1 px-4 py-3 rounded-2xl rounded-tl-sm leading-relaxed"
        style={{
          background: 'var(--morning)',
          color: 'var(--text)',
          fontFamily: 'var(--font-lora), Georgia, serif',
          fontSize: 14,
          fontStyle: 'italic',
        }}
      >
        {text}
      </div>
    </div>
  )
}

function PillButton({
  label,
  selected,
  onClick,
}: {
  label: string
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="px-3.5 py-2 rounded-full text-sm font-medium transition-all"
      style={{
        background: selected ? 'var(--accent)' : 'var(--surface)',
        color: selected ? 'var(--surface)' : 'var(--text)',
        border: `1.5px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
      }}
    >
      {label}
    </button>
  )
}

function StepFooter({
  canAdvance,
  onNext,
}: {
  canAdvance: boolean
  onNext: () => void
}) {
  return (
    <div className="mt-6">
      <button
        onClick={onNext}
        disabled={!canAdvance}
        className="w-full py-3.5 rounded-2xl font-semibold text-sm transition-all"
        style={{
          background: canAdvance ? 'var(--accent)' : 'var(--border)',
          color: canAdvance ? 'var(--surface)' : 'var(--text-3)',
          cursor: canAdvance ? 'pointer' : 'not-allowed',
        }}
      >
        Continue →
      </button>
    </div>
  )
}

function SummaryLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-xs font-medium w-24 shrink-0" style={{ color: 'var(--accent)' }}>
        {label}
      </span>
      <span className="text-xs" style={{ color: 'var(--text)' }}>
        {value}
      </span>
    </div>
  )
}
