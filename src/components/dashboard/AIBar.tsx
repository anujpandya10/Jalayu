'use client'

import { Sparkles } from 'lucide-react'
import { useStore } from '@/store/useStore'

function getAIMessage(
  peakHours: string | null | undefined,
  wakeTime: string | null | undefined
): string {
  const h = new Date().getHours()
  const peak = (peakHours || '').toLowerCase()

  if (h >= 5 && h < 9) {
    if (peak.includes('morning')) {
      return 'Your peak window opens in about an hour. Want me to clear your schedule for deep work?'
    }
    return 'Good early start. Want a quick overview of what matters most today?'
  }
  if (h >= 9 && h < 12) {
    if (peak.includes('morning') || peak.includes('late morning')) {
      return "You're in your peak window right now. Want me to protect this time from distractions?"
    }
    return "Morning focus time. What's the one thing you want to get done before lunch?"
  }
  if (h >= 12 && h < 14) {
    return 'Post-lunch dip is real. Want a 5-minute energy check before you dive back in?'
  }
  if (h >= 14 && h < 17) {
    if (peak.includes('afternoon')) {
      return "You're in your afternoon peak. This is your best time — what needs your full attention?"
    }
    return "Afternoon check-in: how's your energy holding up? Want to see what's left today?"
  }
  if (h >= 17 && h < 20) {
    if (peak.includes('evening')) {
      return "Evening peak activated. Want me to pull up your most creative tasks for now?"
    }
    return 'End of work day approaching. Want to do a quick wrap-up of what you completed?'
  }
  return 'Late session. Want me to help you wind down and prep for tomorrow?'
}

export default function AIBar() {
  const { profile, setShowChatPanel } = useStore()
  const message = getAIMessage(profile?.peak_hours, profile?.wake_time)

  return (
    <div
      style={{
        background: '#EEEDFE',
        borderBottom: '0.5px solid #AFA9EC',
        padding: '8px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        flexShrink: 0,
      }}
    >
      <Sparkles size={14} color="#534AB7" style={{ flexShrink: 0 }} />
      <p
        style={{
          fontSize: 12,
          color: '#3C3489',
          flex: 1,
          margin: 0,
          lineHeight: 1.5,
        }}
      >
        {message}
      </p>
      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        <button
          onClick={() => setShowChatPanel(true)}
          style={{
            background: '#534AB7',
            color: '#fff',
            border: 'none',
            borderRadius: 99,
            padding: '4px 10px',
            fontSize: 11,
            fontWeight: 500,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          Yes, do it ↗
        </button>
        <button
          style={{
            background: 'transparent',
            color: '#534AB7',
            border: '0.5px solid #AFA9EC',
            borderRadius: 99,
            padding: '4px 10px',
            fontSize: 11,
            fontWeight: 400,
            cursor: 'pointer',
          }}
        >
          Later
        </button>
      </div>
    </div>
  )
}
