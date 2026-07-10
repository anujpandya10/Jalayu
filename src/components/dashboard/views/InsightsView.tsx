'use client'

import {
  Brain,
  Eye,
  GitCompare,
  Zap,
  Battery,
  Target,
  Users,
  MessageSquare,
  BookOpen,
  Clock,
} from 'lucide-react'
import type { Insight } from '@/lib/types'
import { EmptyState } from '@/components/ui/EmptyState'

interface InsightsViewProps {
  insights: Insight[]
}

function parseScoreContent(content: string): { score: string; text: string } {
  const parts = content.split('|||')
  if (parts.length >= 2) return { score: parts[0].trim(), text: parts[1].trim() }
  return { score: '', text: content }
}

function parseWeeklyDigest(content: string): Array<{ label: string; text: string }> {
  const sections: Array<{ label: string; text: string }> = []
  const regex = /\[(Coach|Therapist|Friend)\]/g
  let match
  const indices: Array<{ label: string; index: number }> = []

  while ((match = regex.exec(content)) !== null) {
    indices.push({ label: match[1], index: match.index })
  }

  for (let i = 0; i < indices.length; i++) {
    const start = indices[i].index + indices[i].label.length + 2 // skip "[Label]"
    const end = i + 1 < indices.length ? indices[i + 1].index : content.length
    sections.push({ label: indices[i].label, text: content.slice(start, end).trim() })
  }

  return sections.length > 0 ? sections : [{ label: 'Digest', text: content }]
}

const TYPE_CONFIG: Record<
  string,
  { icon: React.ComponentType<{ size?: number; color?: string }>; accentColor: string; label: string }
> = {
  behavioral_mirror: { icon: Eye, accentColor: 'var(--text-2)', label: 'Behavioral Pattern' },
  silence_observer: { icon: Clock, accentColor: 'var(--warning-text)', label: 'Gone Quiet' },
  life_changelog: { icon: GitCompare, accentColor: 'var(--text-2)', label: 'Life Changelog' },
  compound_effect: { icon: Zap, accentColor: 'var(--accent)', label: 'Compound Effect' },
  energy_debt: { icon: Battery, accentColor: 'var(--error-text)', label: 'Energy Debt' },
  goal_momentum: { icon: Target, accentColor: 'var(--accent)', label: 'Goal Momentum' },
  relationship_health: { icon: Users, accentColor: 'var(--text-2)', label: 'Relationship Health' },
  emotional_vocabulary: { icon: MessageSquare, accentColor: 'var(--text-2)', label: 'Emotional Vocabulary' },
}

const GRID_TYPES = [
  'behavioral_mirror',
  'silence_observer',
  'life_changelog',
  'compound_effect',
  'energy_debt',
  'goal_momentum',
  'relationship_health',
  'emotional_vocabulary',
]

export default function InsightsView({ insights }: InsightsViewProps) {
  const focusInsight = insights.find((i) => i.type === 'focus_score')
  const weeklyDigest = insights.find((i) => i.type === 'weekly_digest')
  const dailyInsight = insights.find((i) => i.type === 'cron_daily')

  const focusData = focusInsight ? parseScoreContent(focusInsight.content) : null
  const emotionalInsight = insights.find((i) => i.type === 'emotional_vocabulary')
  const emotionalData = emotionalInsight ? parseScoreContent(emotionalInsight.content) : null

  const gridInsights = GRID_TYPES.map((type) => {
    const insight = insights.find((i) => i.type === type)
    return insight ? { ...insight, _type: type } : null
  }).filter(Boolean) as (Insight & { _type: string })[]

  const hasAnyInsight = insights.length > 0

  return (
    <div style={{ padding: '16px 14px', maxWidth: 640, margin: '0 auto' }}>
      {/* Header */}
      <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)', margin: '0 0 4px' }}>Intelligence</h2>
      <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '0 0 20px' }}>Last 14 days</p>

      {!hasAnyInsight ? (
        <EmptyState
          icon={<Brain size={20} />}
          title="Not ready yet"
          hint="Needs 7 days of moods, tasks, and reflections."
        />
      ) : (
        <>
          {/* Focus Score Card */}
          {focusData && (
            <div
              style={{
                background: 'var(--morning)',
                border: '1px solid var(--border)',
                borderRadius: 14,
                padding: '20px 20px',
                marginBottom: 14,
                display: 'flex',
                alignItems: 'flex-start',
                gap: 18,
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 4 }}>
                  <span style={{ fontSize: 48, fontWeight: 700, color: 'var(--accent)', lineHeight: 1 }}>
                    {focusData.score}
                  </span>
                  <span style={{ fontSize: 20, color: 'var(--text-3)', fontWeight: 400 }}>/100</span>
                </div>
                <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', margin: '0 0 6px' }}>Focus Score</p>
                <p style={{ fontSize: 12, color: 'var(--text-2)', margin: 0, lineHeight: 1.6 }}>{focusData.text}</p>
              </div>
            </div>
          )}

          {/* Emotional Vocabulary Score Card (if score format) */}
          {emotionalData && emotionalData.score && (
            <div
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 14,
                padding: '16px 20px',
                marginBottom: 14,
                display: 'flex',
                alignItems: 'flex-start',
                gap: 18,
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 4 }}>
                  <span style={{ fontSize: 36, fontWeight: 700, color: 'var(--text)', lineHeight: 1 }}>
                    {emotionalData.score}
                  </span>
                  <span style={{ fontSize: 14, color: 'var(--text-3)' }}>words</span>
                </div>
                <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', margin: '0 0 4px' }}>
                  Emotional Vocabulary
                </p>
                <p style={{ fontSize: 12, color: 'var(--text-2)', margin: 0, lineHeight: 1.6 }}>{emotionalData.text}</p>
              </div>
            </div>
          )}

          {/* Weekly Council */}
          {weeklyDigest && (
            <div
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 14,
                padding: '16px 20px',
                marginBottom: 14,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <BookOpen size={14} color="var(--accent)" />
                <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', margin: 0 }}>Weekly Council</p>
              </div>
              {parseWeeklyDigest(weeklyDigest.content).map(({ label, text }) => (
                <div key={label} style={{ marginBottom: 12 }}>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: 'var(--accent)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                    }}
                  >
                    [{label}]
                  </span>
                  <p style={{ fontSize: 13, color: 'var(--text-2)', margin: '4px 0 0', lineHeight: 1.6 }}>{text}</p>
                </div>
              ))}
            </div>
          )}

          {/* Intelligence Grid */}
          {gridInsights.filter((i) => i.type !== 'emotional_vocabulary').length > 0 && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                gap: 10,
                marginBottom: 14,
              }}
            >
              {gridInsights
                .filter((i) => i.type !== 'emotional_vocabulary')
                .map((insight) => {
                  const config = TYPE_CONFIG[insight._type]
                  if (!config) return null
                  const Icon = config.icon

                  let displayContent = insight.content
                  if (insight._type === 'energy_debt' && insight.content.includes('HIGH')) {
                    // energy_debt with HIGH → error accent handled in card border
                  }

                  // For types that might have score format — just show text part
                  if (insight.content.includes('|||')) {
                    displayContent = insight.content.split('|||')[1]?.trim() ?? insight.content
                  }

                  const isEnergyHigh =
                    insight._type === 'energy_debt' && insight.content.toUpperCase().includes('HIGH')

                  const accentColor = isEnergyHigh ? 'var(--error-text)' : config.accentColor

                  return (
                    <div
                      key={insight.id}
                      style={{
                        background: 'var(--surface)',
                        border: `1px solid ${isEnergyHigh ? 'rgba(239,68,68,0.2)' : 'var(--border)'}`,
                        borderRadius: 12,
                        padding: '14px 16px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <Icon size={14} color={accentColor} />
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: accentColor,
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                          }}
                        >
                          {config.label}
                        </span>
                      </div>
                      <p
                        style={{
                          fontSize: 13,
                          fontWeight: 500,
                          color: 'var(--text)',
                          margin: '0 0 6px',
                          lineHeight: 1.4,
                        }}
                      >
                        {insight.title}
                      </p>
                      <p style={{ fontSize: 12, color: 'var(--text-2)', margin: 0, lineHeight: 1.6 }}>
                        {displayContent}
                      </p>
                    </div>
                  )
                })}
            </div>
          )}

          {/* Daily Insight */}
          {dailyInsight && (
            <div
              style={{
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: '14px 16px',
                marginBottom: 14,
              }}
            >
              <p style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-3)', margin: '0 0 6px' }}>Daily Signal</p>
              <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', margin: '0 0 4px' }}>
                {dailyInsight.title}
              </p>
              <p style={{ fontSize: 12, color: 'var(--text-2)', margin: 0, lineHeight: 1.6 }}>
                {dailyInsight.content}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
