'use client'

import { useState } from 'react'
import { BookOpen, LineChart } from 'lucide-react'
import CurriculumBrowser from './CurriculumBrowser'
import PracticeDesk from './PracticeDesk'

type AcademyView = 'curriculum' | 'practice'

/**
 * Academy — the live trading classroom. Two sub-views: the curriculum
 * (legendary-trader strategies mapped to the bot's real setups) and the
 * practice desk (a separate $1000 manual paper account with an AI coach
 * verdict on every order).
 */
export default function AcademyTab() {
  const [view, setView] = useState<AcademyView>('curriculum')

  return (
    <div>
      <div style={{
        display: 'flex', gap: 4, marginBottom: 16,
        padding: 4, borderRadius: 12, background: 'var(--morning)',
        border: '1px solid var(--border)',
      }}>
        {([
          { id: 'curriculum' as const, label: 'Curriculum', icon: <BookOpen size={14} /> },
          { id: 'practice' as const, label: 'Practice desk', icon: <LineChart size={14} /> },
        ]).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setView(t.id)}
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: '9px 8px', borderRadius: 9, border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 600,
              background: view === t.id ? 'var(--surface)' : 'transparent',
              color: view === t.id ? 'var(--text)' : 'var(--text-3)',
              boxShadow: view === t.id ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
              fontFamily: 'inherit',
            }}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {view === 'curriculum' ? <CurriculumBrowser /> : <PracticeDesk />}
    </div>
  )
}
