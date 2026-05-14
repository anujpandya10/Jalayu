'use client'

import { create } from 'zustand'
import type {
  Profile,
  Task,
  Mood,
  Note,
  Reflection,
  Insight,
  ChatMsg,
  SidebarView,
  BottomTab,
  JourneyView,
} from '@/lib/types'

interface JalayuStore {
  // User data
  profile: Profile | null
  tasks: Task[]
  todayMood: Mood | null
  notes: Note[]
  todayReflection: Reflection | null
  insights: Insight[]

  // UI state
  sidebarView: SidebarView
  activeBottomTab: BottomTab
  showChatPanel: boolean
  chatMessages: ChatMsg[]
  journeyView: JourneyView
  isLoading: boolean

  // Data actions
  setProfile: (p: Profile | null) => void
  setTasks: (t: Task[]) => void
  addTask: (t: Task) => void
  updateTask: (id: string, updates: Partial<Task>) => void
  setTodayMood: (m: Mood | null) => void
  setNotes: (n: Note[]) => void
  addNote: (n: Note) => void
  setTodayReflection: (r: Reflection | null) => void
  setInsights: (i: Insight[]) => void

  // UI actions
  setSidebarView: (v: SidebarView) => void
  setActiveBottomTab: (t: BottomTab) => void
  setShowChatPanel: (open: boolean) => void
  addChatMessage: (msg: ChatMsg) => void
  updateLastChatMessage: (content: string) => void
  setJourneyView: (v: JourneyView) => void
  setLoading: (l: boolean) => void
}

export const useStore = create<JalayuStore>((set) => ({
  profile: null,
  tasks: [],
  todayMood: null,
  notes: [],
  todayReflection: null,
  insights: [],
  sidebarView: 'dashboard',
  activeBottomTab: 'home',
  showChatPanel: false,
  chatMessages: [],
  journeyView: 'day1',
  isLoading: false,

  setProfile: (profile) => set({ profile }),
  setTasks: (tasks) => set({ tasks }),
  addTask: (task) => set((s) => ({ tasks: [task, ...s.tasks] })),
  updateTask: (id, updates) =>
    set((s) => ({
      tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    })),
  setTodayMood: (todayMood) => set({ todayMood }),
  setNotes: (notes) => set({ notes }),
  addNote: (note) => set((s) => ({ notes: [note, ...s.notes] })),
  setTodayReflection: (todayReflection) => set({ todayReflection }),
  setInsights: (insights) => set({ insights }),

  setSidebarView: (sidebarView) => set({ sidebarView }),
  setActiveBottomTab: (activeBottomTab) => set({ activeBottomTab }),
  setShowChatPanel: (showChatPanel) => set({ showChatPanel }),
  addChatMessage: (msg) =>
    set((s) => ({ chatMessages: [...s.chatMessages, msg] })),
  updateLastChatMessage: (content) =>
    set((s) => {
      const msgs = [...s.chatMessages]
      if (msgs.length > 0) msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], content }
      return { chatMessages: msgs }
    }),
  setJourneyView: (journeyView) => set({ journeyView }),
  setLoading: (isLoading) => set({ isLoading }),
}))
