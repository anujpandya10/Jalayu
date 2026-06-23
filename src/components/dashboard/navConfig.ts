import type { ComponentType } from 'react'
import type { SidebarView } from '@/lib/types'
import {
  Home,
  CheckSquare,
  BookOpen,
  StickyNote,
  Shield,
  TrendingUp,
  Heart,
  Users,
  Puzzle,
  Mic2,
  Brain,
  Stethoscope,
  FlaskConical,
  GraduationCap,
  Settings,
} from 'lucide-react'

export interface NavItem {
  key: SidebarView
  icon: ComponentType<{ size?: number; color?: string }>
  label: string
  badge?: 'dot-red' | 'dot-green' | 'new-pill'
}

export const NAV_SECTIONS: { section: string; items: NavItem[] }[] = [
  {
    section: 'Main',
    items: [
      { key: 'dashboard', icon: Home, label: 'Home' },
      { key: 'calendar', icon: CheckSquare, label: 'Calendar' },
      { key: 'notes', icon: StickyNote, label: 'Notes' },
      { key: 'vault', icon: Shield, label: 'Vault', badge: 'new-pill' },
      { key: 'memory', icon: BookOpen, label: 'Memory' },
      { key: 'insights', icon: Brain, label: 'Intelligence' },
    ],
  },
  {
    section: 'More',
    items: [
      { key: 'health', icon: Stethoscope, label: 'Health' },
      { key: 'progress', icon: TrendingUp, label: 'Progress' },
      { key: 'wellness', icon: Heart, label: 'Wellness' },
      { key: 'meetings', icon: Mic2, label: 'Meetings' },
      { key: 'mind', icon: Brain, label: 'My mind' },
      { key: 'people', icon: Users, label: 'People' },
      { key: 'widgets', icon: Puzzle, label: 'Widgets', badge: 'new-pill' },
      { key: 'trading', icon: TrendingUp, label: 'Trading', badge: 'new-pill' },
      { key: 'academy', icon: GraduationCap, label: 'Academy', badge: 'new-pill' },
      { key: 'strategylab', icon: FlaskConical, label: 'Strategy Lab', badge: 'new-pill' },
      { key: 'settings', icon: Settings, label: 'Settings' },
    ],
  },
]
