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
          background: isUser ? '#534AB7' : '#fff',
          color: isUser ? '#fff' : '#374151',
          border: isUser ? 'none' : '0.5px solid #E5E3FF',
          fontSize: 13,
          lineHeight: 1.6,
        }}
      >
        {message.content}
      </div>
    </div>
  )
}
