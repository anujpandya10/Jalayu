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
  JourneyView,
  Reminder,
} from '@/lib/types'

interface JalayuStore {
  // User data
  profile: Profile | null
  tasks: Task[]
  todayMood: Mood | null
  notes: Note[]
  todayReflection: Reflection | null
  insights: Insight[]
  reminders: Reminder[]
  moodsRecent: Mood[]
  tasksRecent: Task[]
  reflectionsRecent: Reflection[]

  // UI state
  sidebarView: SidebarView
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
  setReminders: (r: Reminder[]) => void
  addReminder: (r: Reminder) => void
  updateReminder: (id: string, updates: Partial<Reminder>) => void
  setMoodsRecent: (m: Mood[]) => void
  setTasksRecent: (t: Task[]) => void
  setReflectionsRecent: (r: Reflection[]) => void

  // UI actions
  setSidebarView: (v: SidebarView) => void
  setShowChatPanel: (open: boolean) => void
  addChatMessage: (msg: ChatMsg) => void
  updateLastChatMessage: (content: string) => void
  setChatMessages: (msgs: ChatMsg[]) => void
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
  reminders: [],
  moodsRecent: [],
  tasksRecent: [],
  reflectionsRecent: [],
  sidebarView: 'dashboard',
  showChatPanel: false,
  chatMessages: [],
  journeyView: 'day1',
  isLoading: false,

  setProfile: (profile) => set({ profile }),
  setTasks: (tasks) => set({ tasks }),
  addTask: (task) =>
    set((s) => ({
      tasks: [task, ...s.tasks],
      tasksRecent: [task, ...s.tasksRecent.filter((t) => t.id !== task.id)],
    })),
  updateTask: (id, updates) =>
    set((s) => ({
      tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
      tasksRecent: s.tasksRecent.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    })),
  setTodayMood: (todayMood) => set({ todayMood }),
  setNotes: (notes) => set({ notes }),
  addNote: (note) => set((s) => ({ notes: [note, ...s.notes] })),
  setTodayReflection: (todayReflection) => set({ todayReflection }),
  setInsights: (insights) => set({ insights }),
  setReminders: (reminders) => set({ reminders }),
  addReminder: (reminder) => set((s) => ({ reminders: [reminder, ...s.reminders] })),
  updateReminder: (id, updates) =>
    set((s) => ({
      reminders: s.reminders.map((r) => (r.id === id ? { ...r, ...updates } : r)),
    })),
  setMoodsRecent: (moodsRecent) => set({ moodsRecent }),
  setTasksRecent: (tasksRecent) => set({ tasksRecent }),
  setReflectionsRecent: (reflectionsRecent) => set({ reflectionsRecent }),

  setSidebarView: (sidebarView) => set({ sidebarView }),
  setShowChatPanel: (showChatPanel) => set({ showChatPanel }),
  addChatMessage: (msg) =>
    set((s) => ({ chatMessages: [...s.chatMessages, msg] })),
  updateLastChatMessage: (content) =>
    set((s) => {
      const msgs = [...s.chatMessages]
      if (msgs.length > 0) msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], content }
      return { chatMessages: msgs }
    }),
  setChatMessages: (chatMessages) => set({ chatMessages }),
  setJourneyView: (journeyView) => set({ journeyView }),
  setLoading: (isLoading) => set({ isLoading }),
}))
