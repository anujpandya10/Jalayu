import type { ComponentType } from 'react'
import type { SidebarView } from '@/lib/types'
import {
  Home,
  CheckSquare,
  BookOpen,
  Sparkles,
  TrendingUp,
  Heart,
  Users,
  Puzzle,
  Mic2,
  Brain,
  Bell,
  Stethoscope,
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
      { key: 'calendar', icon: CheckSquare, label: 'Today' },
      { key: 'memory', icon: BookOpen, label: 'Memory' },
      { key: 'reflect', icon: Sparkles, label: 'Reflect' },
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
      { key: 'reminders', icon: Bell, label: 'Reminders' },
      { key: 'widgets', icon: Puzzle, label: 'Widgets', badge: 'new-pill' },
      { key: 'trading', icon: TrendingUp, label: 'Trading', badge: 'new-pill' },
    ],
  },
]
