'use client'

/**
 * The life-intake flow — Jalayu's front door. Walks the 5 life categories,
 * collects scenario answers, shows a live preview of the house being built
 * (transparency — you see exactly what each answer turns on), then writes the
 * user's module config. A starting point, not a verdict: fully redoable/resettable.
 */
import { useMemo, useState } from 'react'
import { Loader2, Check, Sparkles } from 'lucide-react'
import toast from 'react-hot-toast'
import { useStore } from '@/store/useStore'
import { LIFE_INTAKE, assembleFromIntake, type IntakeAnswers } from '@/lib/life-intake'
import { getModule } from '@/lib/modules-registry'

export default function LifeIntake({ onDone }: { onDone?: () => void }) {
  const { setEnabledModules } = useStore()
  const [answers, setAnswers] = useState<IntakeAnswers>({})
  const [saving, setSaving] = useState(false)

  const toggle = (questionId: string, optionId: string, multi: boolean) => {
    setAnswers((prev) => {
      const current = prev[questionId] ?? []
      if (multi) {
        const next = current.includes(optionId) ? current.filter((x) => x !== optionId) : [...current, optionId]
        return { ...prev, [questionId]: next }
      }
      return { ...prev, [questionId]: current.includes(optionId) ? [] : [optionId] }
    })
  }

  // Live preview of the house: which non-system modules these answers turn on.
  const preview = useMemo(() => {
    return assembleFromIntake(answers)
      .map((id) => getModule(id))
      .filter((m) => m && m.kind !== 'system')
  }, [answers])

  const answeredCount = Object.values(answers).filter((a) => a.length > 0).length

  const submit = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/intake', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Could not save'); return }
      setEnabledModules(data.enabled ?? [])
      toast.success('Your Jalayu is set up')
      onDone?.()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ maxWidth: 560 }}>
      <div style={{ marginBottom: 18 }}>
        <h2 style={{ fontSize: 19, fontWeight: 600, color: 'var(--text)', margin: '0 0 4px' }}>Set up your Jalayu</h2>
        <p style={{ fontSize: 12.5, color: 'var(--text-2)', margin: 0, lineHeight: 1.5 }}>
          A few real questions about your life. Answer honestly or just explore — every choice shows you what it turns on, and you can redo or reset this anytime.
        </p>
      </div>

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
                      onClick={() => toggle(q.id, opt.id, q.multi)}
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

      {/* Live preview — the house these answers build */}
      <div style={{ position: 'sticky', bottom: 0, background: 'var(--surface)', borderTop: '1px solid var(--border)', paddingTop: 14, marginTop: 4 }}>
        {preview.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <Sparkles size={13} color="var(--accent)" />
              <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-2)' }}>Your Jalayu will include</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {preview.map((m) => (
                <span key={m!.id} style={{ fontSize: 11.5, fontWeight: 500, padding: '4px 9px', borderRadius: 99, background: 'var(--morning)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                  {m!.label}
                </span>
              ))}
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={() => void submit()}
          disabled={saving || answeredCount === 0}
          style={{
            width: '100%', padding: '13px 0', borderRadius: 11, fontSize: 14, fontWeight: 700, fontFamily: 'inherit',
            border: 'none', cursor: saving || answeredCount === 0 ? 'not-allowed' : 'pointer',
            background: answeredCount === 0 ? 'var(--border)' : 'var(--accent)',
            color: answeredCount === 0 ? 'var(--text-3)' : '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          {saving && <Loader2 size={15} className="animate-spin" />}
          {answeredCount === 0 ? 'Answer a question to begin' : 'Assemble my Jalayu'}
        </button>
      </div>
    </div>
  )
}
