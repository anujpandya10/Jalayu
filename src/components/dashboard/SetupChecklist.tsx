import { Settings } from 'lucide-react'
import { CardHeader } from '@/components/ui/Card'
import type { Profile, Note } from '@/lib/types'

interface SetupChecklistProps {
  profile: Profile | null
  notes: Note[]
}

export default function SetupChecklist({ profile, notes }: SetupChecklistProps) {
  const items = [
    { label: 'Tell us about yourself', done: !!profile?.onboarding_complete },
    { label: 'Your dashboard is ready', done: true },
    { label: 'Add your first memory', done: notes.length > 0 },
    { label: 'Log your first mood', done: false, placeholder: true },
    { label: 'Complete your first task', done: false, placeholder: true },
  ]

  const remaining = items.filter((i) => !i.done).length

  return (
    <div className="card">
      <CardHeader
        icon={<Settings size={13} />}
        label="Finish setting up"
        right={
          <span
            style={{
              fontSize: 11,
              color: 'var(--accent)',
              fontWeight: 500,
            }}
          >
            {remaining} left
          </span>
        }
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
        {items.map((item, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: item.done ? '#22C55E' : 'var(--border-2)',
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontSize: 12,
                color: item.done ? 'var(--text-3)' : 'var(--text)',
                textDecoration: item.done ? 'line-through' : 'none',
              }}
            >
              {item.label}
            </span>
          </div>
        ))}
      </div>

      <p style={{ fontSize: 10, color: 'var(--text-2)', margin: 0 }}>
        Each step unlocks a new superpower. None are required.
      </p>
    </div>
  )
}
