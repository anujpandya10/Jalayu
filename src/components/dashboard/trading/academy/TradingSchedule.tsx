'use client'

import { useState, useEffect, useRef } from 'react'
import { Sunrise, Eye, ListChecks, Bell, BellOff, Clock } from 'lucide-react'

interface Step {
  min: number          // minutes-of-day in ET
  time: string
  title: string
  body: string
  icon: typeof Sunrise
}

const STEPS: Step[] = [
  { min: 8 * 60,       time: '8:00 AM', title: 'Wake up & get ready', body: 'Coffee, screens on, clear head. The market opens at 9:30 — you have time.', icon: Sunrise },
  { min: 8 * 60 + 15,  time: '8:15 AM', title: 'Observe the charts', body: 'Pull up your charts and just watch. Pre-market tone, overnight gaps, what is moving. No trading yet.', icon: Eye },
  { min: 8 * 60 + 30,  time: '8:30 AM', title: 'Build your watchlist', body: 'Pick 5 names that fit your rules (price range, volume, a clean setup). Add them to your list.', icon: ListChecks },
  { min: 9 * 60 + 30,  time: '9:30 AM', title: 'Market open — ready to trade', body: 'Bell rings. Trade only your watchlist, only your setups. The first 15 minutes are wild — let it settle.', icon: Clock },
]

function etMinutesNow(): number {
  try {
    const s = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23', hour: '2-digit', minute: '2-digit' }).format(new Date())
    const [h, m] = s.split(':').map((n) => parseInt(n, 10))
    return h * 60 + m
  } catch {
    const d = new Date()
    return d.getHours() * 60 + d.getMinutes()
  }
}
function todayKey(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
}

export default function TradingSchedule() {
  const [nowMin, setNowMin] = useState(etMinutesNow())
  const [notify, setNotify] = useState(false)
  const [permDenied, setPermDenied] = useState(false)
  const firedRef = useRef<Set<number>>(new Set())

  // Load saved notify preference + today's already-fired steps
  useEffect(() => {
    try {
      setNotify(localStorage.getItem('academy_schedule_notify') === '1')
      const raw = localStorage.getItem('academy_schedule_fired')
      if (raw) {
        const parsed = JSON.parse(raw) as { date: string; mins: number[] }
        if (parsed.date === todayKey()) firedRef.current = new Set(parsed.mins)
      }
    } catch { /* ignore */ }
  }, [])

  // Tick the clock + fire due notifications
  useEffect(() => {
    const tick = () => {
      const m = etMinutesNow()
      setNowMin(m)
      if (!notify || typeof Notification === 'undefined' || Notification.permission !== 'granted') return
      for (const step of STEPS) {
        if (!firedRef.current.has(step.min) && m >= step.min && m < step.min + 2) {
          try { new Notification(`${step.time} — ${step.title}`, { body: step.body }) } catch { /* ignore */ }
          firedRef.current.add(step.min)
          try {
            localStorage.setItem('academy_schedule_fired', JSON.stringify({ date: todayKey(), mins: [...firedRef.current] }))
          } catch { /* ignore */ }
        }
      }
    }
    tick()
    const id = window.setInterval(tick, 20_000)
    return () => window.clearInterval(id)
  }, [notify])

  const toggleNotify = async () => {
    if (notify) {
      setNotify(false)
      try { localStorage.setItem('academy_schedule_notify', '0') } catch { /* ignore */ }
      return
    }
    if (typeof Notification === 'undefined') { setPermDenied(true); return }
    let perm = Notification.permission
    if (perm === 'default') perm = await Notification.requestPermission()
    if (perm !== 'granted') { setPermDenied(true); return }
    setPermDenied(false)
    setNotify(true)
    try { localStorage.setItem('academy_schedule_notify', '1') } catch { /* ignore */ }
  }

  const activeIdx = (() => {
    let idx = -1
    for (let i = 0; i < STEPS.length; i++) if (nowMin >= STEPS[i].min) idx = i
    return idx
  })()

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Sunrise size={15} color="var(--accent)" />
          <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: 0 }}>Your trading morning</h3>
        </div>
        <button type="button" onClick={() => void toggleNotify()}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', fontSize: 11, fontWeight: 600, borderRadius: 99, cursor: 'pointer', fontFamily: 'inherit',
            background: notify ? 'rgba(21,128,61,0.12)' : 'var(--morning)', color: notify ? '#15803d' : 'var(--text-2)', border: `1px solid ${notify ? 'rgba(21,128,61,0.35)' : 'var(--border)'}` }}>
          {notify ? <Bell size={11} /> : <BellOff size={11} />}
          {notify ? 'Reminders on' : 'Remind me'}
        </button>
      </div>

      {permDenied && (
        <div style={{ marginBottom: 10, padding: '8px 10px', borderRadius: 8, background: 'rgba(254,243,199,0.6)', border: '1px solid #fde68a', fontSize: 11, color: 'var(--text-2)', lineHeight: 1.5 }}>
          Notifications are blocked in your browser. Allow them for this site to get the nudges (these fire while Jalayu is open in a tab).
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {STEPS.map((step, i) => {
          const Icon = step.icon
          const isActive = i === activeIdx
          const isPast = i < activeIdx
          return (
            <div key={step.min} style={{
              display: 'flex', gap: 12, padding: '11px 12px', borderRadius: 10,
              background: isActive ? 'rgba(10,123,106,0.08)' : 'var(--morning)',
              border: `1px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`,
              opacity: isPast ? 0.6 : 1,
            }}>
              <div style={{ flexShrink: 0, width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: isActive ? 'var(--accent)' : 'var(--surface)', border: '1px solid var(--border)' }}>
                <Icon size={15} color={isActive ? '#fff' : 'var(--text-3)'} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)' }}>{step.time} ET</span>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>{step.title}</span>
                  {isActive && <span style={{ fontSize: 9.5, fontWeight: 700, color: '#fff', background: 'var(--accent)', padding: '1px 6px', borderRadius: 99 }}>NOW</span>}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--text-2)', marginTop: 3, lineHeight: 1.5 }}>{step.body}</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
