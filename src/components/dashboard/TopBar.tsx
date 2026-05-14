'use client'

import { Bell, Settings } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { getGreeting, getDisplayName, formatDate, getDayNumber } from '@/lib/utils'

export default function TopBar() {
  const { profile, setShowChatPanel } = useStore()
  const name = getDisplayName(profile)
  const dayNumber = profile ? getDayNumber(profile.created_at) : 1

  return (
    <div
      style={{
        background: '#fff',
        borderBottom: '0.5px solid #E5E3FF',
        padding: '10px 16px',
        height: 56,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 10,
        flexShrink: 0,
      }}
    >
      {/* Left: greeting */}
      <div>
        <p
          style={{
            fontSize: 16,
            fontWeight: 500,
            color: '#26215C',
            lineHeight: 1.3,
            margin: 0,
          }}
        >
          {getGreeting()}, {name}
        </p>
        <p
          style={{
            fontSize: 11,
            color: '#9CA3AF',
            margin: 0,
          }}
        >
          {formatDate()} · Day {dayNumber}
        </p>
      </div>

      {/* Right: action buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          onClick={() => setShowChatPanel(true)}
          style={{
            width: 28,
            height: 28,
            background: '#F8F7FF',
            border: '0.5px solid #E5E3FF',
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
          title="Notifications"
        >
          <Bell size={13} color="#6b7280" />
        </button>
        <button
          style={{
            width: 28,
            height: 28,
            background: '#F8F7FF',
            border: '0.5px solid #E5E3FF',
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
          title="Settings"
        >
          <Settings size={13} color="#6b7280" />
        </button>
      </div>
    </div>
  )
}
