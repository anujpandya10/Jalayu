'use client'

import { useState } from 'react'
import { CheckCircle2, XCircle } from 'lucide-react'
import type { ScenarioCheck } from '@/lib/academy-curriculum'

interface Props {
  check: ScenarioCheck
  alreadyCorrect?: boolean | null
  onAnswered: (correct: boolean) => void
}

/**
 * One inline multiple-choice question at the end of a chapter — immediate
 * right/wrong with explanation. Not homework, just a quick check before
 * moving on.
 */
export default function ChapterScenarioCheck({ check, alreadyCorrect, onAnswered }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [retry, setRetry] = useState(false)

  if (alreadyCorrect != null && !retry) {
    return (
      <div style={{
        marginTop: 14, padding: '10px 12px', borderRadius: 10,
        background: alreadyCorrect ? 'rgba(34,197,94,0.08)' : 'var(--morning)',
        border: `1px solid ${alreadyCorrect ? 'rgba(34,197,94,0.25)' : 'var(--border)'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
      }}>
        <span style={{ fontSize: 12, color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 6 }}>
          {alreadyCorrect ? <CheckCircle2 size={13} color="#16A34A" /> : <XCircle size={13} color="var(--text-3)" />}
          Scenario check {alreadyCorrect ? 'answered correctly' : 'completed'}
        </span>
        <button
          type="button"
          onClick={() => { setRetry(true); setSelectedId(null) }}
          style={{
            background: 'none', border: 'none', padding: 0, cursor: 'pointer',
            fontSize: 11.5, fontWeight: 600, color: 'var(--accent)', fontFamily: 'inherit',
          }}
        >
          Try again
        </button>
      </div>
    )
  }

  const revealed = selectedId != null
  const selectedOption = check.options.find((o) => o.id === selectedId)

  return (
    <div style={{
      marginTop: 14, padding: 14, borderRadius: 10,
      background: 'var(--morning)', border: '1px solid var(--border)',
    }}>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)', marginBottom: 10 }}>
        {check.prompt}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {check.options.map((opt) => {
          const isSelected = opt.id === selectedId
          const showCorrectness = revealed && (isSelected || opt.correct)
          const bg = !revealed
            ? 'var(--surface)'
            : opt.correct
              ? 'rgba(34,197,94,0.1)'
              : isSelected
                ? 'rgba(239,68,68,0.08)'
                : 'var(--surface)'
          const border = !revealed
            ? 'var(--border)'
            : opt.correct
              ? 'rgba(34,197,94,0.35)'
              : isSelected
                ? 'rgba(239,68,68,0.3)'
                : 'var(--border)'
          return (
            <button
              key={opt.id}
              type="button"
              disabled={revealed}
              onClick={() => {
                setSelectedId(opt.id)
                onAnswered(opt.correct)
              }}
              style={{
                textAlign: 'left', padding: '9px 11px', borderRadius: 8,
                background: bg, border: `1px solid ${border}`,
                cursor: revealed ? 'default' : 'pointer', fontFamily: 'inherit',
                fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5,
                display: 'flex', alignItems: 'flex-start', gap: 7,
              }}
            >
              {showCorrectness && (
                opt.correct
                  ? <CheckCircle2 size={13} color="#16A34A" style={{ flexShrink: 0, marginTop: 1 }} />
                  : <XCircle size={13} color="#DC2626" style={{ flexShrink: 0, marginTop: 1 }} />
              )}
              <span>{opt.label}</span>
            </button>
          )
        })}
      </div>

      {revealed && (
        <div style={{
          marginTop: 10, padding: 10, borderRadius: 8,
          background: 'var(--surface)', border: '1px solid var(--border)',
          fontSize: 11.5, color: 'var(--text-2)', lineHeight: 1.55,
        }}>
          <strong style={{ color: 'var(--text)' }}>
            {selectedOption?.correct ? 'Correct. ' : 'Not quite. '}
          </strong>
          {check.explanation}
        </div>
      )}
    </div>
  )
}
