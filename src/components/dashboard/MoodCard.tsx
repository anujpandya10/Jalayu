'use client'

import { Heart } from 'lucide-react'
import { CardHeader } from '@/components/ui/Card'
import type { Mood } from '@/lib/types'

const EMOJIS = ['😔', '😕', '😐', '🙂', '😄']
const MOOD_LABELS = ['Struggling', 'Off', 'Okay', 'Good', 'Great']

interface MoodCardProps {
  todayMood: Mood | null
  onLog: (score: number) => void
}

export default function MoodCard({ todayMood, onLog }: MoodCardProps) {
  return (
    <div className="card" style={{ minHeight: 110 }}>
      <CardHeader
        icon={<Heart size={13} />}
        label="How are you feeling?"
      />

      {todayMood ? (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 28 }}>{EMOJIS[todayMood.score - 1]}</span>
            <div>
              <p style={{ fontSize: 12, fontWeight: 500, color: '#374151', margin: 0 }}>
                {MOOD_LABELS[todayMood.score - 1]}
              </p>
              <p style={{ fontSize: 10, color: '#9CA3AF', margin: '2px 0 0' }}>
                Logged at{' '}
                {new Date(todayMood.created_at).toLocaleTimeString('en-US', {
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </p>
            </div>
            <button
              onClick={() => onLog(todayMood.score)}
              style={{
                marginLeft: 'auto',
                fontSize: 11,
                color: '#534AB7',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 500,
              }}
            >
              Update
            </button>
          </div>
          <p style={{ fontSize: 10, color: '#9CA3AF', marginTop: 8, marginBottom: 0 }}>
            We track this over time to find your patterns
          </p>
        </div>
      ) : (
        <div>
          <div
            style={{
              display: 'flex',
              gap: 4,
              marginBottom: 8,
            }}
          >
            {EMOJIS.map((emoji, i) => (
              <button
                key={i}
                onClick={() => onLog(i + 1)}
                style={{
                  flex: 1,
                  padding: '6px 4px',
                  background: '#F8F7FF',
                  border: '0.5px solid #E5E3FF',
                  borderRadius: 8,
                  fontSize: 18,
                  cursor: 'pointer',
                  transition: 'transform 0.1s, background 0.1s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'scale(1.15)'
                  e.currentTarget.style.background = '#EEEDFE'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'scale(1)'
                  e.currentTarget.style.background = '#F8F7FF'
                }}
              >
                {emoji}
              </button>
            ))}
          </div>
          <p style={{ fontSize: 10, color: '#9CA3AF', margin: 0 }}>
            We track this over time to find your patterns
          </p>
        </div>
      )}
    </div>
  )
}
