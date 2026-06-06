'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import toast, { Toaster } from 'react-hot-toast'
import { Loader2, ChevronLeft, Plus, X } from 'lucide-react'

// 9 visible steps: 0 welcome, 1..7 questions, 8 welcome letter
const TOTAL_STEPS = 9
const PROGRESS_STEPS = 8 // welcome → boundaries; letter has no progress bar

const LIFE_STAGE_CHIPS = [
  'student',
  'starting out in a career',
  'deep in the work',
  'raising kids',
  'between things',
  'shifting industries',
  'winding down work',
  'starting over',
  'still figuring it out',
]

const HELP_DOMAIN_CHIPS = [
  'research a question',
  'draft messages and replies',
  'plan code changes',
  'scheduling and admin',
  'journaling and reflecting',
  'decision-making',
  'learning something new',
  'organizing my life',
  'just being there',
]

const VOICE_CHIPS = [
  'warm and personal',
  'direct and brief',
  'with some humor',
  'never coachy',
  'plain and serious',
  'like a close friend',
  'gently honest',
  "don't sugarcoat",
]

const variants = {
  enter: { opacity: 0, x: 40 },
  center: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -40 },
}

export default function OnboardingPage() {
  const [step, setStep] = useState(0)
  const [nickname, setNickname] = useState('')
  const [pronouns, setPronouns] = useState('')
  const [lifeStage, setLifeStage] = useState('')
  const [biggestGoal, setBiggestGoal] = useState('')
  const [strugglesText, setStrugglesText] = useState('')
  const [helpDomains, setHelpDomains] = useState<string[]>([])
  const [helpAddInput, setHelpAddInput] = useState('')
  const [voicePrefs, setVoicePrefs] = useState<string[]>([])
  const [boundaries, setBoundaries] = useState('')
  const [welcomeLetter, setWelcomeLetter] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const router = useRouter()

  const canAdvance = (): boolean => {
    if (step === 1) return nickname.trim().length > 0
    if (step === 2) return lifeStage.trim().length > 0
    if (step === 3) return biggestGoal.trim().length >= 3
    if (step === 4) return strugglesText.trim().length >= 3
    if (step === 5) return helpDomains.length > 0
    if (step === 6) return voicePrefs.length > 0
    if (step === 7) return true // boundaries are optional
    return true
  }

  const toggleChip = (list: string[], setList: (v: string[]) => void, value: string) => {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value])
  }

  const addHelpDomain = () => {
    const t = helpAddInput.trim()
    if (!t || helpDomains.includes(t)) return
    setHelpDomains((d) => [...d, t])
    setHelpAddInput('')
  }

  const nextStep = () => {
    if (step < TOTAL_STEPS - 1) setStep((s) => s + 1)
  }
  const prevStep = () => {
    if (step > 0) setStep((s) => s - 1)
  }

  const handleFinish = async () => {
    if (!nickname.trim() || !lifeStage.trim() || biggestGoal.trim().length < 3) {
      toast.error('A few earlier answers look thin — go back and fill those in first.')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/onboarding/finish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nickname: nickname.trim(),
          pronouns: pronouns.trim() || null,
          life_stage: lifeStage.trim(),
          biggest_goal: biggestGoal.trim(),
          struggles_text: strugglesText.trim(),
          help_domains: helpDomains,
          voice_prefs: voicePrefs,
          boundaries: boundaries.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Could not save your profile')
        setSaving(false)
        return
      }
      setWelcomeLetter(data.letter?.text_md || 'I heard you. I’m here.')
      setStep(8)
    } catch (err) {
      console.error(err)
      toast.error('Something went wrong saving your profile. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const enterDashboard = () => {
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg)' }}>
      <Toaster position="top-center" toastOptions={{ style: { borderRadius: '12px', fontSize: '14px' } }} />

      {/* Progress bar — only during the question steps */}
      {step > 0 && step < 8 && (
        <div className="fixed top-0 left-0 right-0 z-10 h-1" style={{ background: 'var(--border)' }}>
          <motion.div
            className="h-full"
            style={{ background: 'var(--accent)' }}
            initial={{ width: 0 }}
            animate={{ width: `${(step / (PROGRESS_STEPS - 1)) * 100}%` }}
            transition={{ type: 'spring', stiffness: 120, damping: 20 }}
          />
        </div>
      )}

      {step > 0 && step < 8 && (
        <button
          onClick={prevStep}
          className="fixed top-4 left-4 z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium"
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
                  <h1 className="text-3xl font-bold mb-3 leading-tight" style={{ color: 'var(--text)' }}>
                    Hi. I&apos;m Jalayu.
                  </h1>
                  <p
                    className="text-base leading-relaxed mb-8 max-w-sm mx-auto"
                    style={{ color: 'var(--text-2)', fontFamily: 'var(--font-lora), Georgia, serif' }}
                  >
                    I&apos;ll move through life with you — carry your intents while you live yours, write you a letter at the end of the day, learn who you are over time.
                    <br /><br />
                    First I need to actually meet you. A few questions, in your own words. Not a form — a conversation.
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

              {/* STEP 1 — Name + pronouns */}
              {step === 1 && (
                <div>
                  <AiBubble text="What should I call you? And — if it matters to you — your pronouns." />
                  <h2 className="text-xl font-bold mb-1 mt-4" style={{ color: 'var(--text)' }}>
                    A name to use
                  </h2>
                  <p className="text-sm mb-5" style={{ color: 'var(--text-2)' }}>
                    What I&apos;ll call you in letters and when we talk
                  </p>
                  <FieldInput
                    value={nickname}
                    onChange={setNickname}
                    placeholder="Your name or nickname"
                  />
                  <div className="mt-4">
                    <p className="text-xs mb-2" style={{ color: 'var(--text-3)' }}>
                      Pronouns (optional)
                    </p>
                    <FieldInput
                      value={pronouns}
                      onChange={setPronouns}
                      placeholder="e.g. she/her, he/him, they/them — or skip"
                    />
                  </div>
                  <StepFooter canAdvance={canAdvance()} onNext={nextStep} />
                </div>
              )}

              {/* STEP 2 — Life stage */}
              {step === 2 && (
                <div>
                  <AiBubble text="Where are you in life right now? Not your job title — the season." />
                  <h2 className="text-xl font-bold mb-1 mt-4" style={{ color: 'var(--text)' }}>
                    What season is this?
                  </h2>
                  <p className="text-sm mb-4" style={{ color: 'var(--text-2)' }}>
                    Pick a chip or write your own — your words always win
                  </p>
                  <FieldTextarea
                    value={lifeStage}
                    onChange={setLifeStage}
                    placeholder="In your own words…"
                    rows={2}
                  />
                  <div className="flex flex-wrap gap-2 mt-3">
                    {LIFE_STAGE_CHIPS.map((c) => (
                      <Chip
                        key={c}
                        label={c}
                        selected={lifeStage.toLowerCase().includes(c.toLowerCase())}
                        onClick={() => setLifeStage(c)}
                      />
                    ))}
                  </div>
                  <StepFooter canAdvance={canAdvance()} onNext={nextStep} />
                </div>
              )}

              {/* STEP 3 — What's on your mind */}
              {step === 3 && (
                <div>
                  <AiBubble text="What's actually on your mind these days? It can be a goal, a worry, a question you can't shake. Whatever's loud." />
                  <h2 className="text-xl font-bold mb-1 mt-4" style={{ color: 'var(--text)' }}>
                    What&apos;s loud right now
                  </h2>
                  <p className="text-sm mb-4" style={{ color: 'var(--text-2)' }}>
                    Stays between you and me
                  </p>
                  <FieldTextarea
                    value={biggestGoal}
                    onChange={setBiggestGoal}
                    placeholder="e.g. I want to leave my job and don't know how. / I'm trying to be more present with my kid. / I want to ship the thing I've been avoiding…"
                    rows={5}
                  />
                  <StepFooter canAdvance={canAdvance()} onNext={nextStep} />
                </div>
              )}

              {/* STEP 4 — What gets in the way */}
              {step === 4 && (
                <div>
                  <AiBubble text="What gets in the way of that? Tell me in your own words — not check-boxes." />
                  <h2 className="text-xl font-bold mb-1 mt-4" style={{ color: 'var(--text)' }}>
                    What gets in the way
                  </h2>
                  <p className="text-sm mb-4" style={{ color: 'var(--text-2)' }}>
                    Be honest. Pretty doesn&apos;t help here.
                  </p>
                  <FieldTextarea
                    value={strugglesText}
                    onChange={setStrugglesText}
                    placeholder="e.g. I crash by 3pm and then doomscroll. / Every time I try to start, I open Twitter…"
                    rows={5}
                  />
                  <StepFooter canAdvance={canAdvance()} onNext={nextStep} />
                </div>
              )}

              {/* STEP 5 — Help domains */}
              {step === 5 && (
                <div>
                  <AiBubble text="How can I help you most? Pick anything that fits — and add your own if I'm missing something." />
                  <h2 className="text-xl font-bold mb-1 mt-4" style={{ color: 'var(--text)' }}>
                    Where you&apos;d use me
                  </h2>
                  <p className="text-sm mb-4" style={{ color: 'var(--text-2)' }}>
                    No wrong answers. You can change this anytime.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {HELP_DOMAIN_CHIPS.map((c) => (
                      <Chip
                        key={c}
                        label={c}
                        selected={helpDomains.includes(c)}
                        onClick={() => toggleChip(helpDomains, setHelpDomains, c)}
                      />
                    ))}
                    {helpDomains
                      .filter((d) => !HELP_DOMAIN_CHIPS.includes(d))
                      .map((d) => (
                        <Chip
                          key={d}
                          label={d}
                          selected
                          onClick={() => toggleChip(helpDomains, setHelpDomains, d)}
                          removable
                        />
                      ))}
                  </div>
                  <div className="flex gap-2 mt-4">
                    <input
                      type="text"
                      value={helpAddInput}
                      onChange={(e) => setHelpAddInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); addHelpDomain() }
                      }}
                      placeholder="add your own…"
                      className="flex-1 px-3 py-2 rounded-xl text-sm"
                      style={{
                        border: '1.5px solid var(--border)',
                        background: 'var(--surface)',
                        color: 'var(--text)',
                        outline: 'none',
                      }}
                    />
                    <button
                      type="button"
                      onClick={addHelpDomain}
                      className="px-3 py-2 rounded-xl text-sm font-medium flex items-center gap-1"
                      style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
                    >
                      <Plus size={14} /> add
                    </button>
                  </div>
                  <StepFooter canAdvance={canAdvance()} onNext={nextStep} />
                </div>
              )}

              {/* STEP 6 — Voice */}
              {step === 6 && (
                <div>
                  <AiBubble text="How do you want me to talk to you? This is the thing most apps get wrong — I'd rather get it right with you." />
                  <h2 className="text-xl font-bold mb-1 mt-4" style={{ color: 'var(--text)' }}>
                    Your voice for me
                  </h2>
                  <p className="text-sm mb-4" style={{ color: 'var(--text-2)' }}>
                    Pick anything that resonates. Even contradictions are fine.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {VOICE_CHIPS.map((c) => (
                      <Chip
                        key={c}
                        label={c}
                        selected={voicePrefs.includes(c)}
                        onClick={() => toggleChip(voicePrefs, setVoicePrefs, c)}
                      />
                    ))}
                  </div>
                  <StepFooter canAdvance={canAdvance()} onNext={nextStep} />
                </div>
              )}

              {/* STEP 7 — Boundaries */}
              {step === 7 && (
                <div>
                  <AiBubble text="Anything you'd rather I never bring up? Topics to steer around? You can skip — but if there's something, name it now." />
                  <h2 className="text-xl font-bold mb-1 mt-4" style={{ color: 'var(--text)' }}>
                    Off-limits
                  </h2>
                  <p className="text-sm mb-4" style={{ color: 'var(--text-2)' }}>
                    Optional. I&apos;ll remember.
                  </p>
                  <FieldTextarea
                    value={boundaries}
                    onChange={setBoundaries}
                    placeholder="e.g. Don't bring up [topic]. Don't reference [situation]. Skip platitudes about [thing]…"
                    rows={4}
                  />
                  <div className="mt-6">
                    <button
                      onClick={handleFinish}
                      disabled={saving}
                      className="w-full py-3.5 rounded-2xl font-semibold text-sm flex items-center justify-center gap-2 transition-all"
                      style={{
                        background: saving ? 'var(--border-2)' : 'var(--accent)',
                        color: 'var(--surface)',
                        cursor: saving ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {saving ? (
                        <>
                          <Loader2 size={16} className="animate-spin" />
                          Listening…
                        </>
                      ) : (
                        'Done — write me a letter ✦'
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 8 — Welcome letter */}
              {step === 8 && welcomeLetter && (
                <div>
                  <div className="text-center mb-6">
                    <span
                      className="text-xs font-bold uppercase tracking-widest"
                      style={{ color: 'var(--accent)' }}
                    >
                      ✦ From Jalayu
                    </span>
                  </div>
                  <div
                    className="rounded-2xl p-6"
                    style={{
                      background: 'var(--morning)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    <div
                      className="md-body"
                      style={{
                        fontFamily: 'var(--font-lora), Georgia, serif',
                        fontSize: 16,
                        lineHeight: 1.75,
                        color: 'var(--text)',
                      }}
                    >
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {welcomeLetter}
                      </ReactMarkdown>
                    </div>
                  </div>
                  <button
                    onClick={enterDashboard}
                    className="w-full mt-6 py-4 rounded-2xl font-semibold text-base"
                    style={{ background: 'var(--accent)', color: 'var(--surface)' }}
                  >
                    I&apos;m here when you need me →
                  </button>
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          {step > 0 && step < 8 && (
            <div className="flex justify-center gap-2 mt-8">
              {Array.from({ length: PROGRESS_STEPS - 1 }).map((_, i) => (
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

// ── Helper components ────────────────────────────────────────────────────────

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

function FieldInput({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-4 py-3 rounded-xl text-sm transition-all"
      style={{
        border: '1.5px solid var(--border)',
        background: 'var(--surface)',
        color: 'var(--text)',
        outline: 'none',
      }}
      onFocus={(e) => (e.target.style.borderColor = 'var(--accent)')}
      onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
    />
  )
}

function FieldTextarea({
  value,
  onChange,
  placeholder,
  rows = 4,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  rows?: number
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full px-4 py-3 rounded-2xl text-sm resize-none transition-all"
      style={{
        border: '1.5px solid var(--border)',
        background: 'var(--surface)',
        color: 'var(--text)',
        outline: 'none',
        lineHeight: '1.6',
      }}
      onFocus={(e) => (e.target.style.borderColor = 'var(--accent)')}
      onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
    />
  )
}

function Chip({
  label,
  selected,
  onClick,
  removable = false,
}: {
  label: string
  selected: boolean
  onClick: () => void
  removable?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className="px-3.5 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-1"
      style={{
        background: selected ? 'var(--accent)' : 'var(--surface)',
        color: selected ? 'var(--accent-fg)' : 'var(--text)',
        border: `1.5px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
      }}
    >
      {label}
      {removable && <X size={12} />}
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
