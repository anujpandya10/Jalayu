import { Target } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { CardHeader } from '@/components/ui/Card'

interface GoalCardProps {
  goal: string | null | undefined
}

export default function GoalCard({ goal }: GoalCardProps) {
  return (
    <div className="card" style={{ minHeight: 110 }}>
      <CardHeader
        icon={<Target size={13} />}
        label="Your goal"
        right={<Badge variant="green">From you</Badge>}
      />

      {goal ? (
        <div>
          <div
            style={{
              background: '#F5F4FF',
              borderRadius: 8,
              borderLeft: '3px solid #534AB7',
              padding: '9px 11px',
              marginBottom: 8,
            }}
          >
            <p
              style={{
                fontSize: 12,
                color: '#26215C',
                fontStyle: 'italic',
                lineHeight: 1.6,
                margin: 0,
              }}
            >
              &ldquo;{goal}&rdquo;
            </p>
          </div>
          <p style={{ fontSize: 10, color: '#9CA3AF', margin: 0 }}>
            Everything I do is working toward this.
          </p>
        </div>
      ) : (
        <p style={{ fontSize: 12, color: '#9CA3AF', margin: 0 }}>
          Your goal will appear here after onboarding.
        </p>
      )}
    </div>
  )
}
