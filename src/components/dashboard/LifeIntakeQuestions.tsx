'use client'

/**
 * The life-intake question list, extracted from LifeIntake.tsx so both the
 * Settings flow (LifeIntake.tsx, own submit button) and the onboarding wizard
 * (its own "Continue", batched into handleFinish) render the exact same
 * questions from one source of truth.
 */
import { Check } from 'lucide-react'
import { LIFE_INTAKE, type IntakeAnswers } from '@/lib/life-intake'

export default function LifeIntakeQuestions({
  answers,
  onToggle,
}: {
  answers: IntakeAnswers
  onToggle: (questionId: string, optionId: string, multi: boolean) => void
}) {
  return (
    <>
      {LIFE_INTAKE.map((category) => (
        <div key={category.id} style={{ marginBottom: 22 }}>
          <p style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 8px' }}>
            {category.title}
          </p>
          {category.questions.map((q) => (
            <div key={q.id}>
              <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)', margin: '0 0 10px', lineHeight: 1.45 }}>{q.prompt}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {q.options.map((opt) => {
                  const selected = (answers[q.id] ?? []).includes(opt.id)
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => onToggle(q.id, opt.id, q.multi)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
                        padding: '11px 13px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
                        background: selected ? 'var(--morning)' : 'var(--surface)',
                        border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
                        color: 'var(--text)', fontSize: 13, lineHeight: 1.4, width: '100%',
                      }}
                    >
                      <span style={{
                        width: 18, height: 18, flexShrink: 0, borderRadius: q.multi ? 5 : 99,
                        border: `1.5px solid ${selected ? 'var(--accent)' : 'var(--border-2)'}`,
                        background: selected ? 'var(--accent)' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {selected && <Check size={12} color="#fff" />}
                      </span>
                      {opt.label}
                    </button>
                  )
                })}
              </div>
              {q.multi && <p style={{ fontSize: 10.5, color: 'var(--text-3)', margin: '6px 0 0' }}>Pick any that fit.</p>}
            </div>
          ))}
        </div>
      ))}
    </>
  )
}
