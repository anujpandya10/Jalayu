import type { ComponentType } from 'react'
import type { SidebarView } from '@/lib/types'
import {
  LayoutDashboard,
  Calendar,
  Bell,
  Brain,
  Sparkles,
  TrendingUp,
  Heart,
  BookOpen,
  History,
  Users,
  Puzzle,
  Mic2,
} from 'lucide-react'

export interface NavItem {
  key: SidebarView
  icon: ComponentType<{ size?: number; color?: string }>
  label: string
  badge?: 'dot-red' | 'dot-green' | 'new-pill'
}

export const NAV_SECTIONS: { section: string; items: NavItem[] }[] = [
  {
    section: 'Today',
    items: [
      { key: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
      { key: 'calendar', icon: Calendar, label: 'My day' },
      { key: 'reminders', icon: Bell, label: 'Reminders', badge: 'dot-red' },
      { key: 'mind', icon: Brain, label: 'My mind' },
      { key: 'meetings', icon: Mic2, label: 'Meetings' },
      { key: 'reflect', icon: Sparkles, label: 'Reflect' },
    ],
  },
  {
    section: 'Grow',
    items: [
      { key: 'progress', icon: TrendingUp, label: 'Progress', badge: 'dot-green' },
      { key: 'wellness', icon: Heart, label: 'Wellness' },
      { key: 'learning', icon: BookOpen, label: 'Learning' },
    ],
  },
  {
    section: 'Life',
    items: [
      { key: 'memory', icon: History, label: 'Memory' },
      { key: 'people', icon: Users, label: 'People' },
      { key: 'widgets', icon: Puzzle, label: 'Widgets', badge: 'new-pill' },
    ],
  },
]
