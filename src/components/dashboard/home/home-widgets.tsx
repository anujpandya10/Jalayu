'use client'

import {
  Mic, MicOff, ChevronRight,
  TrendingUp, TrendingDown, Heart,
  BookOpen, Brain, Users, FlaskConical, BarChart2, Zap, Target,
  ArrowUpRight, ArrowDownRight,
} from 'lucide-react'
import type { Profile, Task, Mood, Reminder } from '@/lib/types'
import type { HomeWidgetId, WidgetSize } from '@/lib/dashboard-layout'
import ScheduleCompact from '@/components/dashboard/ScheduleCompact'
import HealthCompact from '@/components/dashboard/HealthCompact'
import ReflectionCompact from '@/components/dashboard/ReflectionCompact'
import GalaxyOrb from '@/components/GalaxyOrb'
import PorscheClock from '@/components/dashboard/PorscheClock'
import type { HealthProfile, Medication, HealthAppointment } from '@/lib/types'
import type { TradingPosition } from '@/components/dashboard/views/HomeContent'

type ContainerId = 'left' | 'center' | 'right' | 'mobile'

const AMBER = '#00C9A7'

const MOODS = [
  { score: 1, emoji: '😔', label: 'Rough' },
  { score: 2, emoji: '😕', label: 'Low'   },
  { score: 3, emoji: '😐', label: 'Okay'  },
  { score: 4, emoji: '🙂', label: 'Good'  },
  { score: 5, emoji: '😊', label: 'Great' },
]
const MOOD_EMOJI:  Record<number, string> = { 1: '😔', 2: '😕', 3: '😐', 4: '🙂', 5: '😊' }
const MOOD_LABEL:  Record<number, string> = { 1: 'Rough', 2: 'Low', 3: 'Okay', 4: 'Good', 5: 'Great' }

function Dots() {
  return (
    <div style={{ display: 'flex', gap: 5, alignItems: 'center', height: 20 }}>
      {[0, 1, 2].map((i) => (
        <span key={i} style={{
          width: 4, height: 4, borderRadius: '50%', background: 'var(--text-3)',
          display: 'inline-block', animation: `jdot 1.3s ease-in-out ${i * 0.18}s infinite`,
        }} />
      ))}
    </div>
  )
}

// ── Base card wrapper ─────────────────────────────────────────────────────────
function W({
  accent, icon: Icon, label, onClick, children, noPad = false,
}: {
  accent: string
  icon: React.ComponentType<{ size?: number; color?: string }>
  label: string
  onClick?: () => void
  children: React.ReactNode
  noPad?: boolean
}) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      onClick={onClick}
      className="hwidget"
      style={{
        display: 'flex', flexDirection: 'column',
        width: '100%', height: '100%',
        textAlign: 'left',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 18,
        padding: noPad ? 0 : '14px 16px',
        cursor: onClick ? 'pointer' : 'default',
        position: 'relative', overflow: 'hidden',
        boxSizing: 'border-box',
      } as React.CSSProperties}
    >
      {/* corner glow */}
      <div style={{ position: 'absolute', top: 0, right: 0, width: 90, height: 90,
        background: `radial-gradient(circle at 100% 0%, ${accent}1A 0%, transparent 65%)`,
        pointerEvents: 'none' }} />

      {/* header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 24, height: 24, borderRadius: 7, background: `${accent}18`,
            display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon size={12} color={accent} />
          </div>
          <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            {label}
          </span>
        </div>
        {onClick && <ChevronRight size={12} color="var(--text-3)" />}
      </div>

      {/* content */}
      <div style={{ flex: 1, minHeight: 0 }}>{children}</div>
    </Tag>
  )
}

// ── Explore list (unchanged) ──────────────────────────────────────────────────
function ExploreLinks({ items }: {
  items: { icon: React.ComponentType<{ size?: number; color?: string }>; label: string; sub: string; onClick: () => void }[]
}) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, overflow: 'hidden', height: '100%', boxSizing: 'border-box' }}>
      <p style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0, padding: '12px 16px 8px' }}>
        Explore
      </p>
      {items.map((item, i) => {
        const Icon = item.icon
        return (
          <button key={item.label} type="button" onClick={item.onClick} className="hwidget"
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px',
              background: 'none', border: 'none', borderTop: i > 0 ? '1px solid var(--border)' : 'none',
              cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
            <span style={{ width: 28, height: 28, borderRadius: 8, background: `${AMBER}14`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
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

// ── Context type ─────────────────────────────────────────────────────────────
export interface HomeWidgetContext {
  profile: Profile | null
  tasks: Task[]
  reminders: Reminder[]
  todayMood: Mood | null
  yesterdayMood?: Mood
  moodsRecent?: Mood[]
  healthProfiles: HealthProfile[]
  medications: Medication[]
  healthAppointments: HealthAppointment[]
  todayReflection: import('@/lib/types').Reflection | null
  quote: { text: string; author: string }
  tradingSnap: { netWorth: number; totalPnl: number; totalPnlPct: number; openPositions: number; totalTrades: number; positions: TradingPosition[] } | null
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

function identityOrbSize(size: WidgetSize) {
  if (size === 'small') return 64
  if (size === 'large') return 120
  return 96
}
function identityClockSize(size: WidgetSize, fallback: number) {
  if (size === 'small') return 80
  if (size === 'large') return Math.max(fallback, 148)
  return fallback
}

// ── Main renderer ─────────────────────────────────────────────────────────────
export function renderHomeWidget(
  id: HomeWidgetId,
  column: ContainerId,
  size: WidgetSize,
  ctx: HomeWidgetContext,
): React.ReactNode | null {
  const compact  = size === 'small'
  const expanded = size === 'large'

  const snap = ctx.tradingSnap
  const pnlPositive = (snap?.totalPnl ?? 0) >= 0
  const pnlColor    = pnlPositive ? '#22C55E' : '#EF4444'

  switch (id) {

    // ── Identity ────────────────────────────────────────────────────────────
    case 'identity':
      return (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 20, height: '100%', boxSizing: 'border-box',
          padding: compact ? '12px 12px 10px' : '20px 18px 16px',
          display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
        }}>
          {/* Small: clock only */}
          {compact ? (
            <>
              <div className="porsche-clock-wrap" style={{ width: '100%' }}>
                <PorscheClock size={identityClockSize(size, ctx.clockSize)} />
              </div>
              <p style={{ fontSize: 10, color: 'var(--text-3)', margin: '4px 0 0' }}>{ctx.firstName}</p>
            </>
          ) : (
            <>
              <GalaxyOrb state={ctx.orbState} size={identityOrbSize(size)} />
              <p style={{ fontSize: expanded ? 19 : 17, fontWeight: 700, color: 'var(--text)', margin: '8px 0 6px', letterSpacing: '-0.02em' }}>
                {ctx.greeting}{ctx.firstName ? `, ${ctx.firstName}` : ''}
              </p>
              <div className="porsche-clock-wrap" style={{ width: '100%' }}>
                <PorscheClock size={identityClockSize(size, ctx.clockSize)} />
              </div>
              {ctx.chapter && (
                <p style={{ fontSize: 10, color: 'var(--text-3)', margin: '3px 0 0', fontStyle: 'italic', opacity: 0.8 }}>{ctx.chapter}</p>
              )}
              {expanded && (ctx.profile?.streak_count ?? 0) > 0 && (
                <div style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 4,
                  background: `${AMBER}18`, border: `1px solid ${AMBER}30`, borderRadius: 99, padding: '3px 10px' }}>
                  <span style={{ fontSize: 12 }}>🔥</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: AMBER }}>{ctx.profile?.streak_count} day streak</span>
                </div>
              )}
            </>
          )}
        </div>
      )

    // ── Morning note ────────────────────────────────────────────────────────
    case 'morning_note':
      return (
        <div style={{
          background: 'var(--morning)', border: `1px solid ${AMBER}28`, borderRadius: 18,
          padding: compact ? '10px 12px' : '14px 16px',
          boxShadow: `0 0 20px ${AMBER}0A`,
          height: '100%', boxSizing: 'border-box',
          display: 'flex', flexDirection: 'column',
        }}>
          {!compact && (
            <p style={{ fontSize: 9, fontWeight: 700, color: AMBER, textTransform: 'uppercase', letterSpacing: '0.12em', margin: '0 0 8px', flexShrink: 0 }}>
              ✦ From Jalayu
            </p>
          )}
          {ctx.noteLoading ? <Dots /> : (
            <>
              <p style={{
                fontFamily: 'var(--font-lora), Georgia, serif', fontStyle: 'italic',
                fontSize: compact ? 12 : 13, lineHeight: 1.8, color: 'var(--text-2)', margin: 0, flex: 1,
                display: '-webkit-box',
                WebkitLineClamp: compact ? 2 : expanded ? 999 : 4,
                WebkitBoxOrient: 'vertical', overflow: 'hidden',
              }}>
                {ctx.morningNote || 'A new day to work toward what matters.'}
              </p>
              {!compact && (
                <button type="button" onClick={() => ctx.setShowChatPanel(true)}
                  style={{ marginTop: 8, fontSize: 11, color: 'var(--text-3)', background: 'none', border: 'none',
                    cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                  keep talking <ChevronRight size={10} />
                </button>
              )}
            </>
          )}
        </div>
      )

    // ── Ask Jalayu ──────────────────────────────────────────────────────────
    case 'ask_jalayu':
      return (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18,
          padding: compact ? '10px 12px' : '14px 16px',
          height: '100%', boxSizing: 'border-box',
          display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: compact ? 6 : 10, flexShrink: 0 }}>
            <div style={{ width: 22, height: 22, borderRadius: 6, background: `${AMBER}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Zap size={11} color={AMBER} />
            </div>
            <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Ask Jalayu</span>
            <div style={{ width: 6, height: 6, borderRadius: '50%', marginLeft: 'auto',
              background: ctx.orbState === 'idle' ? 'var(--border-2)' : ctx.orbState === 'listening' ? '#EF4444' : AMBER,
              animation: ctx.orbState !== 'idle' ? 'pulse 1.2s ease-in-out infinite' : 'none' }} />
          </div>
          {!ctx.submitted ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              {!compact && ctx.focus && (
                <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '0 0 6px', fontStyle: 'italic', lineHeight: 1.5 }}>&ldquo;{ctx.focus}&rdquo;</p>
              )}
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8,
                borderBottom: `1.5px solid ${ctx.voiceListening ? 'rgba(220,38,38,0.35)' : 'var(--border-2)'}`,
                paddingBottom: 6, marginTop: 'auto' }}>
                <textarea ref={ctx.inputRef} value={ctx.input}
                  onChange={(e) => ctx.setInput(e.target.value)} onKeyDown={ctx.handleKeyDown}
                  placeholder={ctx.voiceListening ? 'Listening…' : 'Tell me anything…'}
                  rows={1}
                  style={{ flex: 1, resize: 'none', border: 'none', background: 'transparent',
                    fontSize: 13, color: 'var(--text)', outline: 'none', fontFamily: 'inherit',
                    lineHeight: 1.7, minHeight: 26, maxHeight: 100, padding: 0 }} />
                <button type="button" onClick={ctx.startHomeVoice}
                  style={{ width: 26, height: 26, borderRadius: '50%', border: '1px solid var(--border)',
                    background: 'var(--surface-2)', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                  {ctx.voiceListening ? <MicOff size={12} color="#DC2626" /> : <Mic size={12} color="var(--text-3)" />}
                </button>
              </div>
              {ctx.input.trim() && (
                <button type="button" onClick={ctx.sendMessage}
                  style={{ marginTop: 8, fontSize: 11, color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  send → (or Enter)
                </button>
              )}
            </div>
          ) : (
            <div className="fade-up" ref={ctx.replyRef} style={{ flex: 1 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: '0 0 10px' }}>{ctx.userAnswer}</p>
              {ctx.reply?.content ? (
                <p style={{ fontFamily: 'var(--font-lora), Georgia, serif', fontStyle: 'italic',
                  fontSize: 13, lineHeight: 1.8, color: 'var(--text-2)', margin: 0,
                  display: '-webkit-box', WebkitLineClamp: expanded ? 999 : 4,
                  WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {ctx.reply.content}
                </p>
              ) : <Dots />}
            </div>
          )}
        </div>
      )

    // ── Quote ───────────────────────────────────────────────────────────────
    case 'quote':
      return (
        <div style={{
          background: `linear-gradient(135deg, ${AMBER}12 0%, transparent 60%)`,
          border: `1px solid ${AMBER}28`, borderRadius: 18,
          padding: compact ? '10px 12px' : '16px 20px',
          position: 'relative', overflow: 'hidden',
          height: '100%', boxSizing: 'border-box',
          display: 'flex', flexDirection: 'column', justifyContent: 'center',
        }}>
          {/* Small: just the quote text, tight */}
          {compact ? (
            <p style={{ fontFamily: 'var(--font-lora), Georgia, serif', fontStyle: 'italic',
              fontSize: 12, lineHeight: 1.6, color: 'var(--text)', margin: 0, fontWeight: 500,
              display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              &ldquo;{ctx.quote.text}&rdquo;
            </p>
          ) : (
            <>
              <p style={{ fontSize: 9, fontWeight: 700, color: AMBER, textTransform: 'uppercase',
                letterSpacing: '0.12em', margin: '0 0 10px', textAlign: 'center' }}>✦ Daily Inspiration</p>
              <p style={{ fontFamily: 'var(--font-lora), Georgia, serif', fontStyle: 'italic',
                fontSize: expanded ? 16 : 14, lineHeight: 1.75, color: 'var(--text)',
                margin: '0 0 10px', fontWeight: 500, textAlign: 'center',
                display: '-webkit-box', WebkitLineClamp: expanded ? 999 : 4,
                WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                &ldquo;{ctx.quote.text}&rdquo;
              </p>
              <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0, fontWeight: 600, textAlign: 'center' }}>
                — {ctx.quote.author}
              </p>
            </>
          )}
        </div>
      )

    // ── Reflection ──────────────────────────────────────────────────────────
    case 'reflection':
      return (
        <ReflectionCompact
          reflection={ctx.todayReflection}
          onOpenReflect={() => ctx.setSidebarView('memory')}
          variant={column === 'right' ? 'sidebar' : 'default'}
          size={size}
        />
      )

    // ── Mood ────────────────────────────────────────────────────────────────
    case 'mood':
      return (
        <W accent={AMBER} icon={Heart} label="Mood" onClick={() => ctx.setSidebarView('wellness')}>
          {ctx.todayMood ? (
            <>
              {/* Small: emoji + tiny label */}
              {compact && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 28, lineHeight: 1 }}>{MOOD_EMOJI[ctx.todayMood.score]}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 600 }}>{MOOD_LABEL[ctx.todayMood.score]}</span>
                </div>
              )}
              {/* Medium: emoji + label + yesterday */}
              {!compact && !expanded && (
                <>
                  <p style={{ fontSize: 32, lineHeight: 1, margin: '0 0 4px' }}>{MOOD_EMOJI[ctx.todayMood.score]}</p>
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: '0 0 2px' }}>{MOOD_LABEL[ctx.todayMood.score]}</p>
                  {ctx.yesterdayMood && (
                    <p style={{ fontSize: 10, color: 'var(--text-3)', margin: 0 }}>Yesterday: {MOOD_EMOJI[ctx.yesterdayMood.score]} {MOOD_LABEL[ctx.yesterdayMood.score]}</p>
                  )}
                </>
              )}
              {/* Large: emoji + label + yesterday + weekly mini-chart */}
              {expanded && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                    <span style={{ fontSize: 40, lineHeight: 1 }}>{MOOD_EMOJI[ctx.todayMood.score]}</span>
                    <div>
                      <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: '0 0 2px' }}>{MOOD_LABEL[ctx.todayMood.score]}</p>
                      {ctx.yesterdayMood && (
                        <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0 }}>Yesterday {MOOD_EMOJI[ctx.yesterdayMood.score]}</p>
                      )}
                    </div>
                  </div>
                  {/* Last 7 days mini dots */}
                  {ctx.moodsRecent && ctx.moodsRecent.length > 0 && (
                    <div>
                      <p style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px' }}>Last 7 days</p>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {ctx.moodsRecent.slice(0, 7).reverse().map((m, i) => (
                          <div key={i} title={MOOD_LABEL[m.score]}
                            style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                              background: m.score >= 4 ? AMBER : m.score === 3 ? '#F59E0B' : '#EF4444', opacity: 0.85 }} />
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          ) : (
            /* Not logged yet */
            <>
              {compact ? (
                <div style={{ display: 'flex', gap: 2 }}>
                  {MOODS.map(({ score, emoji, label }) => (
                    <button key={score} type="button" onClick={(e) => { e.stopPropagation(); ctx.onMoodLog(score) }}
                      title={label} style={{ fontSize: 16, background: 'none', border: 'none', cursor: 'pointer', padding: 1 }}>
                      {emoji}
                    </button>
                  ))}
                </div>
              ) : (
                <>
                  <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', margin: '0 0 8px' }}>How are you today?</p>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {MOODS.map(({ score, emoji, label }) => (
                      <button key={score} type="button" onClick={(e) => { e.stopPropagation(); ctx.onMoodLog(score) }}
                        title={label} style={{ fontSize: expanded ? 24 : 20, background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
                        {emoji}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </W>
      )

    // ── Health ──────────────────────────────────────────────────────────────
    case 'health':
      return (
        <HealthCompact
          healthProfiles={ctx.healthProfiles}
          medications={ctx.medications}
          reminders={ctx.reminders}
          onOpenHealth={() => ctx.setSidebarView('health')}
          size={size}
        />
      )

    // ── Schedule ────────────────────────────────────────────────────────────
    case 'schedule':
      return (
        <ScheduleCompact
          tasks={ctx.tasks}
          reminders={ctx.reminders}
          healthAppointments={ctx.healthAppointments}
          onAddTask={ctx.onAddTask}
          onToggleTask={ctx.onToggleTask}
          onOpenFullCalendar={() => ctx.setSidebarView('calendar')}
          size={size}
        />
      )

    // ── Trading ─────────────────────────────────────────────────────────────
    case 'trading': {
      const PnlIcon = pnlPositive ? ArrowUpRight : ArrowDownRight

      // Small: net worth + P&L delta — same pattern as every brokerage app
      if (compact) return (
        <W accent={pnlColor} icon={pnlPositive ? TrendingUp : TrendingDown} label="Trading" onClick={() => ctx.setSidebarView('trading')}>
          {/* Total portfolio value */}
          <p style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', margin: '0 0 4px', lineHeight: 1 }}>
            {snap ? `$${snap.netWorth.toFixed(2)}` : '—'}
          </p>
          {/* P&L with correct sign — e.g. "-$0.24 (-0.05%)" or "+$1.20 (+0.24%)" */}
          <p style={{ fontSize: 11, color: pnlColor, margin: 0, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 3 }}>
            {snap ? (
              <>
                <span>{pnlPositive ? '+' : '−'}${Math.abs(snap.totalPnl).toFixed(2)}</span>
                <span style={{ opacity: 0.75 }}>({pnlPositive ? '+' : ''}{snap.totalPnlPct.toFixed(2)}%)</span>
              </>
            ) : null}
          </p>
        </W>
      )

      // Medium: net worth + P&L + open count
      if (!expanded) return (
        <W accent={pnlColor} icon={pnlPositive ? TrendingUp : TrendingDown} label="Trading" onClick={() => ctx.setSidebarView('trading')}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 }}>
            <div>
              <p style={{ fontSize: 28, fontWeight: 800, color: 'var(--text)', lineHeight: 1, margin: '0 0 3px' }}>
                {snap ? `$${snap.netWorth.toFixed(2)}` : '—'}
              </p>
              <p style={{ fontSize: 11, color: 'var(--text-2)', margin: 0 }}>
                {snap?.openPositions ?? 0} open · {snap?.totalTrades ?? 0} trades
              </p>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 2, justifyContent: 'flex-end' }}>
                <PnlIcon size={14} color={pnlColor} />
                <p style={{ fontSize: 20, fontWeight: 700, color: pnlColor, margin: 0 }}>
                  {pnlPositive ? '+' : '−'}${Math.abs(snap?.totalPnl ?? 0).toFixed(2)}
                </p>
              </div>
              <p style={{ fontSize: 10, color: pnlColor, margin: '1px 0 0', textAlign: 'right', opacity: 0.75 }}>
                {snap ? `${pnlPositive ? '+' : ''}${snap.totalPnlPct.toFixed(2)}%` : ''}
              </p>
            </div>
          </div>
        </W>
      )

      // Large: net worth + P&L + positions table
      const positions = snap?.positions ?? []
      return (
        <W accent={pnlColor} icon={pnlPositive ? TrendingUp : TrendingDown} label="Trading" onClick={() => ctx.setSidebarView('trading')}>
          {/* Summary row */}
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 14 }}>
            <div>
              <p style={{ fontSize: 26, fontWeight: 800, color: 'var(--text)', lineHeight: 1, margin: '0 0 3px' }}>
                {snap ? `$${snap.netWorth.toFixed(2)}` : '—'}
              </p>
              <p style={{ fontSize: 10, color: 'var(--text-2)', margin: 0 }}>Total portfolio</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 2, justifyContent: 'flex-end' }}>
                <PnlIcon size={14} color={pnlColor} />
                <p style={{ fontSize: 18, fontWeight: 700, color: pnlColor, margin: 0 }}>
                  {pnlPositive ? '+' : '−'}${Math.abs(snap?.totalPnl ?? 0).toFixed(2)}
                </p>
              </div>
              <p style={{ fontSize: 10, color: pnlColor, margin: '1px 0 0', opacity: 0.75 }}>
                {snap ? `${pnlPositive ? '+' : ''}${snap.totalPnlPct.toFixed(2)}% all-time` : ''}
              </p>
            </div>
          </div>

          {/* Positions table */}
          {positions.length > 0 ? (
            <div>
              <p style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px' }}>
                Open positions
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {positions.slice(0, 6).map((pos) => {
                  const posGain = pos.pnl >= 0
                  const posColor = posGain ? '#16A34A' : '#DC2626'
                  return (
                    <div key={pos.symbol} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '5px 8px', background: 'var(--surface-2)', borderRadius: 8, gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                        <span style={{ fontSize: 9, fontWeight: 700, color: pos.direction === 'SHORT' ? '#EF4444' : AMBER,
                          background: pos.direction === 'SHORT' ? '#FEF2F2' : `${AMBER}15`,
                          padding: '1px 5px', borderRadius: 4 }}>
                          {pos.direction === 'SHORT' ? 'S' : 'L'}
                        </span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {pos.symbol}
                        </span>
                        <span style={{ fontSize: 10, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          ${pos.currentPrice < 10 ? pos.currentPrice.toFixed(4) : pos.currentPrice.toFixed(2)}
                        </span>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: posColor }}>
                          {posGain ? '+' : ''}{pos.pnlPct.toFixed(1)}%
                        </span>
                        <span style={{ fontSize: 10, color: posColor, display: 'block' }}>
                          {posGain ? '+' : ''}${pos.pnl.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  )
                })}
                {positions.length > 6 && (
                  <p style={{ fontSize: 10, color: 'var(--text-3)', margin: '2px 0 0', textAlign: 'center' }}>
                    +{positions.length - 6} more — tap to view all
                  </p>
                )}
              </div>
            </div>
          ) : (
            <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0, textAlign: 'center', paddingTop: 8 }}>
              No open positions
            </p>
          )}
        </W>
      )
    }

    // ── North Star ──────────────────────────────────────────────────────────
    case 'north_star':
      if (!ctx.profile?.biggest_goal) return null
      return (
        <W accent={AMBER} icon={Target} label="North star" onClick={() => ctx.setSidebarView('settings')}>
          {/* Small: 2 lines */}
          {compact && (
            <p style={{ fontFamily: 'var(--font-lora), Georgia, serif', fontStyle: 'italic',
              fontSize: 12, lineHeight: 1.55, color: 'var(--text)', margin: 0,
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {ctx.profile.biggest_goal}
            </p>
          )}
          {/* Medium: goal + subtle cta */}
          {!compact && !expanded && (
            <>
              <p style={{ fontFamily: 'var(--font-lora), Georgia, serif', fontStyle: 'italic',
                fontSize: 13, lineHeight: 1.55, color: 'var(--text)', margin: '0 0 8px',
                display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {ctx.profile.biggest_goal}
              </p>
              <span style={{ fontSize: 10, color: AMBER, fontWeight: 600 }}>Your north star →</span>
            </>
          )}
          {/* Large: full goal + streak + prompt */}
          {expanded && (
            <>
              <p style={{ fontFamily: 'var(--font-lora), Georgia, serif', fontStyle: 'italic',
                fontSize: 14, lineHeight: 1.65, color: 'var(--text)', margin: '0 0 12px' }}>
                {ctx.profile.biggest_goal}
              </p>
              {(ctx.profile.streak_count ?? 0) > 0 && (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5,
                  background: `${AMBER}15`, border: `1px solid ${AMBER}25`, borderRadius: 99, padding: '4px 12px' }}>
                  <span>🔥</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: AMBER }}>Day {ctx.profile.streak_count}</span>
                </div>
              )}
            </>
          )}
        </W>
      )

    // ── Progress ────────────────────────────────────────────────────────────
    case 'progress':
      return (
        <W accent={AMBER} icon={BarChart2} label="Progress" onClick={() => ctx.setSidebarView('progress')}>
          {/* Small: just the score */}
          {compact && (
            <p style={{ fontSize: 30, fontWeight: 800, color: 'var(--text)', margin: 0, lineHeight: 1 }}>
              {ctx.profile?.growth_score ?? 0}
            </p>
          )}
          {/* Medium: score + weekly % */}
          {!compact && !expanded && (
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
              <div>
                <p style={{ fontSize: 26, fontWeight: 800, color: 'var(--text)', margin: '0 0 2px', lineHeight: 1 }}>
                  {ctx.profile?.growth_score ?? 0}
                </p>
                <p style={{ fontSize: 10, color: 'var(--text-2)', margin: 0 }}>growth score</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontSize: 20, fontWeight: 700, color: AMBER, margin: 0 }}>{ctx.weekPct}%</p>
                <p style={{ fontSize: 10, color: 'var(--text-3)', margin: 0 }}>this week</p>
              </div>
            </div>
          )}
          {/* Large: score + weekly % + bar + streak */}
          {expanded && (
            <>
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 12 }}>
                <div>
                  <p style={{ fontSize: 28, fontWeight: 800, color: 'var(--text)', margin: '0 0 2px', lineHeight: 1 }}>
                    {ctx.profile?.growth_score ?? 0}
                  </p>
                  <p style={{ fontSize: 10, color: 'var(--text-2)', margin: 0 }}>growth score</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontSize: 22, fontWeight: 700, color: AMBER, margin: 0 }}>{ctx.weekPct}%</p>
                  <p style={{ fontSize: 10, color: 'var(--text-3)', margin: 0 }}>tasks done this week</p>
                </div>
              </div>
              <div style={{ height: 5, background: 'var(--border)', borderRadius: 99, overflow: 'hidden', marginBottom: 10 }}>
                <div style={{ height: '100%', width: `${ctx.weekPct}%`, background: `linear-gradient(90deg, ${AMBER}, #67E8F9)`, borderRadius: 99, transition: 'width 0.6s ease' }} />
              </div>
              {(ctx.profile?.streak_count ?? 0) > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ fontSize: 13 }}>🔥</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>
                    {ctx.profile?.streak_count} day streak
                  </span>
                </div>
              )}
            </>
          )}
        </W>
      )

    // ── Explore ─────────────────────────────────────────────────────────────
    case 'explore':
      return (
        <ExploreLinks
          items={[
            { icon: Brain, label: 'AI insights', sub: compact ? 'Patterns' : 'Patterns from your data', onClick: () => ctx.setSidebarView('insights') },
            ...(compact ? [] : [{ icon: Users, label: 'Your circle', sub: 'Contacts & relationships', onClick: () => ctx.setSidebarView('people') }]),
          ]}
        />
      )

    // ── Strategy Lab ────────────────────────────────────────────────────────
    case 'strategy_lab':
      return (
        <W accent={AMBER} icon={FlaskConical} label="Strategy Lab" onClick={() => ctx.setSidebarView('strategylab')}>
          {compact && (
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: 0 }}>Strategies</p>
          )}
          {!compact && !expanded && (
            <>
              <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: '0 0 3px' }}>Win rates by setup</p>
              <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0, lineHeight: 1.5 }}>Enable / disable strategies</p>
            </>
          )}
          {expanded && (
            <>
              <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: '0 0 6px' }}>Win rates by setup</p>
              <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '0 0 10px', lineHeight: 1.5 }}>Enable or disable trading strategies and track their performance over time.</p>
              <span style={{ fontSize: 11, color: AMBER, fontWeight: 600 }}>Open Strategy Lab →</span>
            </>
          )}
        </W>
      )

    // ── Memory ──────────────────────────────────────────────────────────────
    case 'memory':
      return (
        <W accent={AMBER} icon={BookOpen} label="Memory" onClick={() => ctx.setSidebarView('memory')}>
          {compact && (
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: 0 }}>Memory</p>
          )}
          {!compact && !expanded && (
            <>
              <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: '0 0 3px' }}>Second brain</p>
              <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0, lineHeight: 1.5 }}>Capture & reflect on your thoughts</p>
            </>
          )}
          {expanded && (
            <>
              <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: '0 0 4px' }}>Second brain</p>
              <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '0 0 12px', lineHeight: 1.5 }}>Your notes, reflections, and captured thoughts — all in one place.</p>
              <span style={{ fontSize: 11, color: AMBER, fontWeight: 600 }}>Open Memory →</span>
            </>
          )}
        </W>
      )

    default:
      return null
  }
}
