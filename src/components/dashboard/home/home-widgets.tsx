'use client'

import {
  Mic, MicOff, ChevronRight,
  TrendingUp, TrendingDown, Heart,
  BookOpen, Brain, Users, FlaskConical, BarChart2, Zap, Target,
} from 'lucide-react'
import type { Profile, Task, Mood, Reminder } from '@/lib/types'
import type { HomeWidgetId } from '@/lib/dashboard-layout'
import ScheduleCompact from '@/components/dashboard/ScheduleCompact'
import HealthCompact from '@/components/dashboard/HealthCompact'
import ReflectionCompact from '@/components/dashboard/ReflectionCompact'
import GalaxyOrb from '@/components/GalaxyOrb'
import PorscheClock from '@/components/dashboard/PorscheClock'
import type { HealthProfile, Medication, HealthAppointment } from '@/lib/types'

type ContainerId = 'left' | 'center' | 'right' | 'mobile'

const AMBER = '#00C9A7'

const MOODS = [
  { score: 1, emoji: '😔', label: 'Rough' },
  { score: 2, emoji: '😕', label: 'Low' },
  { score: 3, emoji: '😐', label: 'Okay' },
  { score: 4, emoji: '🙂', label: 'Good' },
  { score: 5, emoji: '😊', label: 'Great' },
]
const MOOD_EMOJI: Record<number, string> = { 1: '😔', 2: '😕', 3: '😐', 4: '🙂', 5: '😊' }
const MOOD_LABEL: Record<number, string> = { 1: 'Rough', 2: 'Low', 3: 'Okay', 4: 'Good', 5: 'Great' }

function Dots() {
  return (
    <div style={{ display: 'flex', gap: 5, alignItems: 'center', height: 20 }}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: 4,
            height: 4,
            borderRadius: '50%',
            background: 'var(--text-3)',
            display: 'inline-block',
            animation: `jdot 1.3s ease-in-out ${i * 0.18}s infinite`,
          }}
        />
      ))}
    </div>
  )
}

function W({
  accent,
  icon: Icon,
  label,
  onClick,
  children,
}: {
  accent: string
  icon: React.ComponentType<{ size?: number; color?: string }>
  label: string
  onClick?: () => void
  children: React.ReactNode
}) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      onClick={onClick}
      className="hwidget"
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 18,
        padding: '14px 16px',
        cursor: onClick ? 'pointer' : 'default',
        position: 'relative',
        overflow: 'hidden',
      } as React.CSSProperties}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: 90,
          height: 90,
          background: `radial-gradient(circle at 100% 0%, ${accent}1A 0%, transparent 65%)`,
          pointerEvents: 'none',
        }}
      />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: 7,
              background: `${accent}18`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon size={12} color={accent} />
          </div>
          <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            {label}
          </span>
        </div>
        {onClick && <ChevronRight size={12} color="var(--text-3)" />}
      </div>
      {children}
    </Tag>
  )
}

function ExploreLinks({
  items,
}: {
  items: { icon: React.ComponentType<{ size?: number; color?: string }>; label: string; sub: string; onClick: () => void }[]
}) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, overflow: 'hidden' }}>
      <p style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0, padding: '12px 16px 8px' }}>
        Explore
      </p>
      {items.map((item, i) => {
        const Icon = item.icon
        return (
          <button
            key={item.label}
            type="button"
            onClick={item.onClick}
            className="hwidget"
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '11px 16px',
              background: 'none',
              border: 'none',
              borderTop: i > 0 ? '1px solid var(--border)' : 'none',
              cursor: 'pointer',
              textAlign: 'left',
              fontFamily: 'inherit',
            }}
          >
            <span
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                background: `${AMBER}14`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Icon size={13} color={AMBER} />
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{item.label}</span>
              <span style={{ display: 'block', fontSize: 11, color: 'var(--text-3)', marginTop: 1 }}>{item.sub}</span>
            </span>
            <ChevronRight size={14} color="var(--text-3)" style={{ flexShrink: 0 }} />
          </button>
        )
      })}
    </div>
  )
}

export interface HomeWidgetContext {
  profile: Profile | null
  tasks: Task[]
  reminders: Reminder[]
  todayMood: Mood | null
  yesterdayMood?: Mood
  healthProfiles: HealthProfile[]
  medications: Medication[]
  healthAppointments: HealthAppointment[]
  todayReflection: import('@/lib/types').Reflection | null
  quote: { text: string; author: string }
  tradingSnap: { netWorth: number; totalPnl: number; totalPnlPct: number; openPositions: number; totalTrades: number } | null
  weekPct: number
  greeting: string
  firstName: string
  chapter: string | null
  morningNote: string | null
  noteLoading: boolean
  focus: string | null
  orbState: 'idle' | 'listening' | 'speaking'
  clockSize: number
  voiceListening: boolean
  input: string
  submitted: boolean
  userAnswer: string
  reply: { content: string; streaming: boolean } | null
  inputRef: React.RefObject<HTMLTextAreaElement | null>
  replyRef: React.RefObject<HTMLDivElement | null>
  onMoodLog: (score: number) => void
  onAddTask: (title: string, date?: string, eventType?: string) => Promise<void>
  onToggleTask: (task: Task) => Promise<void>
  setSidebarView: (v: import('@/lib/types').SidebarView) => void
  setShowChatPanel: (v: boolean) => void
  setInput: (v: string) => void
  sendMessage: () => void
  handleKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
  startHomeVoice: () => void
}

export function renderHomeWidget(id: HomeWidgetId, column: ContainerId, ctx: HomeWidgetContext): React.ReactNode | null {
  const pnlPositive = (ctx.tradingSnap?.totalPnl ?? 0) >= 0
  const pnlColor = pnlPositive ? '#22C55E' : '#EF4444'

  switch (id) {
    case 'identity':
      return (
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 20,
            padding: '20px 18px 16px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
          }}
        >
          <GalaxyOrb state={ctx.orbState} size={100} />
          <p style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', margin: '10px 0 8px', letterSpacing: '-0.02em' }}>
            {ctx.greeting}
            {ctx.firstName ? `, ${ctx.firstName}` : ''}
          </p>
          <div className="porsche-clock-wrap">
            <PorscheClock size={ctx.clockSize} />
          </div>
          {ctx.chapter && (
            <p style={{ fontSize: 10, color: 'var(--text-3)', margin: '3px 0 0', fontStyle: 'italic', opacity: 0.8 }}>{ctx.chapter}</p>
          )}
          {(ctx.profile?.streak_count ?? 0) > 0 && (
            <div
              style={{
                marginTop: 10,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                background: `${AMBER}18`,
                border: `1px solid ${AMBER}30`,
                borderRadius: 99,
                padding: '3px 10px',
              }}
            >
              <span style={{ fontSize: 12 }}>🔥</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: AMBER }}>{ctx.profile?.streak_count} day streak</span>
            </div>
          )}
        </div>
      )

    case 'morning_note':
      return (
        <div style={{ background: 'var(--morning)', border: `1px solid ${AMBER}28`, borderRadius: 18, padding: '14px 16px', boxShadow: `0 0 20px ${AMBER}0A` }}>
          <p style={{ fontSize: 9, fontWeight: 700, color: AMBER, textTransform: 'uppercase', letterSpacing: '0.12em', margin: '0 0 8px' }}>✦ From Jalayu</p>
          {ctx.noteLoading ? (
            <Dots />
          ) : (
            <p style={{ fontFamily: 'var(--font-lora), Georgia, serif', fontStyle: 'italic', fontSize: 13, lineHeight: 1.8, color: 'var(--text-2)', margin: 0 }}>
              {ctx.morningNote || 'A new day to work toward what matters.'}
            </p>
          )}
          {!ctx.noteLoading && (
            <button
              type="button"
              onClick={() => ctx.setShowChatPanel(true)}
              style={{ marginTop: 8, fontSize: 11, color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 3 }}
            >
              keep talking <ChevronRight size={10} />
            </button>
          )}
        </div>
      )

    case 'ask_jalayu':
      return (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, padding: '14px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <div style={{ width: 22, height: 22, borderRadius: 6, background: `${AMBER}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Zap size={11} color={AMBER} />
            </div>
            <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Ask Jalayu</span>
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                marginLeft: 'auto',
                background: ctx.orbState === 'idle' ? 'var(--border-2)' : ctx.orbState === 'listening' ? '#EF4444' : AMBER,
                animation: ctx.orbState !== 'idle' ? 'pulse 1.2s ease-in-out infinite' : 'none',
              }}
            />
          </div>
          {!ctx.submitted ? (
            <>
              {ctx.focus && (
                <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '0 0 6px', fontStyle: 'italic', lineHeight: 1.5 }}>&ldquo;{ctx.focus}&rdquo;</p>
              )}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-end',
                  gap: 8,
                  borderBottom: `1.5px solid ${ctx.voiceListening ? 'rgba(220,38,38,0.35)' : 'var(--border-2)'}`,
                  paddingBottom: 6,
                }}
              >
                <textarea
                  ref={ctx.inputRef}
                  value={ctx.input}
                  onChange={(e) => ctx.setInput(e.target.value)}
                  onKeyDown={ctx.handleKeyDown}
                  placeholder={ctx.voiceListening ? 'Listening…' : 'Tell me anything…'}
                  rows={1}
                  style={{
                    flex: 1,
                    resize: 'none',
                    border: 'none',
                    background: 'transparent',
                    fontSize: 13,
                    color: 'var(--text)',
                    outline: 'none',
                    fontFamily: 'inherit',
                    lineHeight: 1.7,
                    minHeight: 26,
                    maxHeight: 100,
                    padding: 0,
                  }}
                />
                <button type="button" onClick={ctx.startHomeVoice} style={{ width: 26, height: 26, borderRadius: '50%', border: '1px solid var(--border)', background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                  {ctx.voiceListening ? <MicOff size={12} color="#DC2626" /> : <Mic size={12} color="var(--text-3)" />}
                </button>
              </div>
              {ctx.input.trim() && (
                <button type="button" onClick={ctx.sendMessage} style={{ marginTop: 8, fontSize: 11, color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  send → (or Enter)
                </button>
              )}
            </>
          ) : (
            <div className="fade-up" ref={ctx.replyRef}>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: '0 0 10px' }}>{ctx.userAnswer}</p>
              {ctx.reply?.content ? (
                <p style={{ fontFamily: 'var(--font-lora), Georgia, serif', fontStyle: 'italic', fontSize: 13, lineHeight: 1.8, color: 'var(--text-2)', margin: 0 }}>
                  {ctx.reply.content}
                </p>
              ) : (
                <Dots />
              )}
            </div>
          )}
        </div>
      )

    case 'quote':
      return (
        <div style={{ background: `linear-gradient(135deg, ${AMBER}12 0%, transparent 60%)`, border: `1px solid ${AMBER}28`, borderRadius: 18, padding: '14px 18px', position: 'relative', overflow: 'hidden' }}>
          <p style={{ fontSize: 9, fontWeight: 700, color: AMBER, textTransform: 'uppercase', letterSpacing: '0.12em', margin: '0 0 8px', textAlign: 'center' }}>✦ Daily Inspiration</p>
          <p style={{ fontFamily: 'var(--font-lora), Georgia, serif', fontStyle: 'italic', fontSize: 14, lineHeight: 1.75, color: 'var(--text)', margin: '0 0 8px', fontWeight: 500, textAlign: 'center' }}>
            &ldquo;{ctx.quote.text}&rdquo;
          </p>
          <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0, fontWeight: 600, textAlign: 'center' }}>— {ctx.quote.author}</p>
        </div>
      )

    case 'reflection':
      return (
        <ReflectionCompact
          reflection={ctx.todayReflection}
          onOpenReflect={() => ctx.setSidebarView('memory')}
          variant={column === 'right' ? 'sidebar' : 'default'}
        />
      )

    case 'mood':
      return (
        <W accent={AMBER} icon={Heart} label="Mood" onClick={() => ctx.setSidebarView('wellness')}>
          {ctx.todayMood ? (
            <>
              <p style={{ fontSize: 32, lineHeight: 1, margin: '0 0 3px' }}>{MOOD_EMOJI[ctx.todayMood.score]}</p>
              <p style={{ fontSize: 11, color: 'var(--text-2)', margin: 0 }}>{MOOD_LABEL[ctx.todayMood.score]}</p>
              {ctx.yesterdayMood && <p style={{ fontSize: 10, color: 'var(--text-3)', margin: '5px 0 0' }}>Yesterday {MOOD_EMOJI[ctx.yesterdayMood.score]}</p>}
            </>
          ) : (
            <>
              <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', margin: '0 0 7px' }}>Log today</p>
              <div style={{ display: 'flex', gap: 3 }}>
                {MOODS.map(({ score, emoji, label }) => (
                  <button
                    key={score}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      ctx.onMoodLog(score)
                    }}
                    title={label}
                    style={{ fontSize: 16, background: 'none', border: 'none', cursor: 'pointer', padding: 1 }}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </>
          )}
        </W>
      )

    case 'health':
      return (
        <HealthCompact
          healthProfiles={ctx.healthProfiles}
          medications={ctx.medications}
          reminders={ctx.reminders}
          onOpenHealth={() => ctx.setSidebarView('health')}
        />
      )

    case 'schedule':
      return (
        <ScheduleCompact
          tasks={ctx.tasks}
          reminders={ctx.reminders}
          healthAppointments={ctx.healthAppointments}
          onAddTask={ctx.onAddTask}
          onToggleTask={ctx.onToggleTask}
          onOpenFullCalendar={() => ctx.setSidebarView('calendar')}
        />
      )

    case 'trading':
      return (
        <W accent={pnlColor} icon={ctx.tradingSnap && pnlPositive ? TrendingUp : TrendingDown} label="Trading Portfolio" onClick={() => ctx.setSidebarView('trading')}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <p style={{ fontSize: 28, fontWeight: 800, color: 'var(--text)', lineHeight: 1, margin: '0 0 3px' }}>
                {ctx.tradingSnap ? `$${ctx.tradingSnap.netWorth.toFixed(2)}` : '—'}
              </p>
              <p style={{ fontSize: 11, color: 'var(--text-2)', margin: 0 }}>
                Net worth · {ctx.tradingSnap?.openPositions ?? 0} open · {ctx.tradingSnap?.totalTrades ?? 0} trades
              </p>
            </div>
            {ctx.tradingSnap && (
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontSize: 20, fontWeight: 700, color: pnlColor, margin: 0 }}>{pnlPositive ? '+' : ''}{ctx.tradingSnap.totalPnl.toFixed(2)}</p>
              </div>
            )}
          </div>
        </W>
      )

    case 'north_star':
      if (!ctx.profile?.biggest_goal) return null
      return (
        <W accent={AMBER} icon={Target} label="North star" onClick={() => ctx.setSidebarView('settings')}>
          <p style={{ fontFamily: 'var(--font-lora), Georgia, serif', fontStyle: 'italic', fontSize: 13, lineHeight: 1.55, color: 'var(--text)', margin: 0 }}>
            {ctx.profile.biggest_goal}
          </p>
        </W>
      )

    case 'progress':
      return (
        <W accent={AMBER} icon={BarChart2} label="Progress" onClick={() => ctx.setSidebarView('progress')}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div>
              <p style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', margin: '0 0 2px' }}>{ctx.profile?.growth_score ?? 0}</p>
              <p style={{ fontSize: 10, color: 'var(--text-2)', margin: 0 }}>growth points</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: 16, fontWeight: 700, color: AMBER, margin: 0 }}>{ctx.weekPct}%</p>
              <p style={{ fontSize: 10, color: 'var(--text-3)', margin: 0 }}>this week</p>
            </div>
          </div>
          <div style={{ height: 4, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${ctx.weekPct}%`, background: `linear-gradient(90deg, ${AMBER}, #67E8F9)`, borderRadius: 99 }} />
          </div>
        </W>
      )

    case 'explore':
      return (
        <ExploreLinks
          items={[
            { icon: Brain, label: 'AI insights', sub: 'Patterns from your data', onClick: () => ctx.setSidebarView('insights') },
            { icon: Users, label: 'Your circle', sub: 'Contacts & relationships', onClick: () => ctx.setSidebarView('people') },
          ]}
        />
      )

    case 'strategy_lab':
      return (
        <W accent={AMBER} icon={FlaskConical} label="Strategy Lab" onClick={() => ctx.setSidebarView('strategylab')}>
          <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: '0 0 3px' }}>Win rates by setup</p>
          <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0, lineHeight: 1.5 }}>Enable / disable strategies</p>
        </W>
      )

    case 'memory':
      return (
        <W accent={AMBER} icon={BookOpen} label="Memory" onClick={() => ctx.setSidebarView('memory')}>
          <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: '0 0 3px' }}>Second brain</p>
          <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0, lineHeight: 1.5 }}>Reflect & save notes</p>
        </W>
      )

    default:
      return null
  }
}
