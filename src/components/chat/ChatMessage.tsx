import type { ChatMsg } from '@/lib/types'

interface ChatMessageProps {
  message: ChatMsg
}

export default function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user'

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
        marginBottom: 12,
      }}
    >
      <div
        style={{
          maxWidth: '82%',
          padding: '9px 12px',
          borderRadius: isUser ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
          background: isUser ? 'var(--accent)' : 'var(--surface)',
          color: isUser ? '#fff' : 'var(--text)',
          border: isUser ? 'none' : '1px solid var(--border)',
          fontSize: 13,
          lineHeight: 1.6,
          boxShadow: isUser ? '0 0 12px rgba(99,102,241,0.25)' : 'none',
        }}
      >
        {message.content}
      </div>
    </div>
  )
}
