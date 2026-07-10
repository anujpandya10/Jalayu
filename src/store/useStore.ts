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
  HealthProfile,
  Medication,
  HealthAppointment,
  MedicalRecord,
} from '@/lib/types'

/**
 * Context describing what the user is currently looking at on screen.
 * Passed to the chat API so Jalayu understands phrases like "this folder",
 * "the note I have open", "what I have here", etc.
 */
export interface ChatContextState {
  view: SidebarView
  folderId?: string | null
  folderName?: string | null
  noteId?: string | null
  noteName?: string | null
  /** Free-form label for non-folder/note contexts (e.g. "Trading dashboard") */
  label?: string | null
}

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
  // Health
  healthProfiles: HealthProfile[]
  medications: Medication[]
  healthAppointments: HealthAppointment[]
  medicalRecords: MedicalRecord[]

  // UI state
  sidebarView: SidebarView
  showChatPanel: boolean
  chatMessages: ChatMsg[]
  journeyView: JourneyView
  isLoading: boolean
  /** Enabled module ids from the user's personalization. null = not loaded, [] = never personalized (shell shows all). */
  enabledModules: string[] | null
  /** Premium module ids permanently unlocked for this user (owner or explicit grant). null = not loaded yet. */
  grantedPremiumModules: string[] | null
  /** 7-day premium trial state. null = not loaded yet. */
  premiumTrial: { active: boolean; daysLeft: number } | null
  /** 'light' | 'dark' — mirrors the data-theme attribute so UI (the toggle icon) can react
   * without reading the DOM. Source of truth for persistence is src/lib/theme.ts. */
  theme: 'light' | 'dark'
  /** When set, the premium-lock dialog is open for this module (a locked nav item was clicked). */
  premiumLockPrompt: { key: SidebarView; label: string } | null
  /** Hand-off from the lock dialog to the Feedback view: pre-select a category + message. */
  feedbackPrefill: { category: string; message: string } | null
  /** When set, the trading disclaimer + risk-tier gate is open; onAccept runs the action that
   * was blocked (place order / enable auto-trading) once the user confirms. */
  tradingGatePrompt: { onAccept: () => void } | null

  /**
   * What is the user currently looking at? Updated by views (e.g. NotesView)
   * when the user navigates into a folder or opens a note. Read by the chat
   * API so Jalayu knows the user's screen context — "what I have here", "this
   * folder", "look at this" all resolve correctly.
   */
  chatContext: ChatContextState

  // Data actions
  setProfile: (p: Profile | null) => void
  setTasks: (t: Task[]) => void
  addTask: (t: Task) => void
  updateTask: (id: string, updates: Partial<Task>) => void
  removeTask: (id: string) => void
  setTodayMood: (m: Mood | null) => void
  setNotes: (n: Note[]) => void
  addNote: (n: Note) => void
  upsertNote: (n: Note) => void
  setTodayReflection: (r: Reflection | null) => void
  setInsights: (i: Insight[]) => void
  setReminders: (r: Reminder[]) => void
  addReminder: (r: Reminder) => void
  updateReminder: (id: string, updates: Partial<Reminder>) => void
  setMoodsRecent: (m: Mood[]) => void
  setTasksRecent: (t: Task[]) => void
  setReflectionsRecent: (r: Reflection[]) => void
  // Health actions
  setHealthProfiles: (h: HealthProfile[]) => void
  addHealthProfile: (h: HealthProfile) => void
  updateHealthProfile: (h: HealthProfile) => void
  removeHealthProfile: (id: string) => void
  setMedications: (m: Medication[]) => void
  addMedication: (m: Medication) => void
  updateMedication: (m: Medication) => void
  removeMedication: (id: string) => void
  setHealthAppointments: (a: HealthAppointment[]) => void
  addHealthAppointment: (a: HealthAppointment) => void
  updateHealthAppointment: (a: HealthAppointment) => void
  removeHealthAppointment: (id: string) => void
  setMedicalRecords: (r: MedicalRecord[]) => void
  addMedicalRecord: (r: MedicalRecord) => void
  updateMedicalRecord: (r: MedicalRecord) => void
  removeMedicalRecord: (id: string) => void

  // UI actions
  setSidebarView: (v: SidebarView) => void
  setShowChatPanel: (open: boolean) => void
  addChatMessage: (msg: ChatMsg) => void
  updateLastChatMessage: (content: string) => void
  setChatMessages: (msgs: ChatMsg[]) => void
  setJourneyView: (v: JourneyView) => void
  setLoading: (l: boolean) => void
  setChatContext: (ctx: Partial<ChatContextState>) => void
  setEnabledModules: (ids: string[] | null) => void
  setGrantedPremiumModules: (ids: string[] | null) => void
  setPremiumTrial: (t: { active: boolean; daysLeft: number } | null) => void
  setTheme: (theme: 'light' | 'dark') => void
  setPremiumLockPrompt: (p: { key: SidebarView; label: string } | null) => void
  setFeedbackPrefill: (p: { category: string; message: string } | null) => void
  setTradingGatePrompt: (p: { onAccept: () => void } | null) => void
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
  healthProfiles: [],
  medications: [],
  healthAppointments: [],
  medicalRecords: [],
  sidebarView: 'dashboard',
  showChatPanel: false,
  enabledModules: null,
  grantedPremiumModules: null,
  premiumTrial: null,
  theme: 'light',
  premiumLockPrompt: null,
  feedbackPrefill: null,
  tradingGatePrompt: null,
  chatContext: { view: 'dashboard' },
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
  removeTask: (id) =>
    set((s) => ({
      tasks: s.tasks.filter((t) => t.id !== id),
      tasksRecent: s.tasksRecent.filter((t) => t.id !== id),
    })),
  setTodayMood: (todayMood) => set({ todayMood }),
  setNotes: (notes) => set({ notes }),
  addNote: (note) => set((s) => ({ notes: [note, ...s.notes] })),
  /** Replace if id exists, otherwise prepend. Used after AI updates a note. */
  upsertNote: (note) => set((s) => {
    const idx = s.notes.findIndex((n) => n.id === note.id)
    if (idx >= 0) {
      const next = [...s.notes]
      next[idx] = note
      return { notes: next }
    }
    return { notes: [note, ...s.notes] }
  }),
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
  setHealthProfiles: (healthProfiles) => set({ healthProfiles }),
  addHealthProfile: (p) =>
    set((s) => ({ healthProfiles: [...s.healthProfiles, p] })),
  updateHealthProfile: (p) =>
    set((s) => ({
      healthProfiles: s.healthProfiles.map((x) => (x.id === p.id ? p : x)),
    })),
  removeHealthProfile: (id) =>
    set((s) => ({ healthProfiles: s.healthProfiles.filter((x) => x.id !== id) })),
  setMedications: (medications) => set({ medications }),
  addMedication: (m) =>
    set((s) => ({ medications: [m, ...s.medications] })),
  updateMedication: (m) =>
    set((s) => ({
      medications: s.medications.map((x) => (x.id === m.id ? m : x)),
    })),
  removeMedication: (id) =>
    set((s) => ({ medications: s.medications.filter((x) => x.id !== id) })),
  setHealthAppointments: (healthAppointments) => set({ healthAppointments }),
  addHealthAppointment: (a) =>
    set((s) => ({ healthAppointments: [a, ...s.healthAppointments] })),
  updateHealthAppointment: (a) =>
    set((s) => ({
      healthAppointments: s.healthAppointments.map((x) => (x.id === a.id ? a : x)),
    })),
  removeHealthAppointment: (id) =>
    set((s) => ({
      healthAppointments: s.healthAppointments.filter((x) => x.id !== id),
    })),
  setMedicalRecords: (medicalRecords) => set({ medicalRecords }),
  addMedicalRecord: (r) =>
    set((s) => ({ medicalRecords: [r, ...s.medicalRecords] })),
  updateMedicalRecord: (r) =>
    set((s) => ({
      medicalRecords: s.medicalRecords.map((x) => (x.id === r.id ? r : x)),
    })),
  removeMedicalRecord: (id) =>
    set((s) => ({ medicalRecords: s.medicalRecords.filter((x) => x.id !== id) })),

  setSidebarView: (sidebarView) => set((s) => ({
    sidebarView,
    // Reset context when view changes — components push fresh context as needed
    chatContext: { ...s.chatContext, view: sidebarView, folderId: null, folderName: null, noteId: null, noteName: null, label: null },
  })),
  setShowChatPanel: (showChatPanel) => set({ showChatPanel }),
  setEnabledModules: (enabledModules) => set({ enabledModules }),
  setGrantedPremiumModules: (grantedPremiumModules) => set({ grantedPremiumModules }),
  setPremiumTrial: (premiumTrial) => set({ premiumTrial }),
  setTheme: (theme) => set({ theme }),
  setPremiumLockPrompt: (premiumLockPrompt) => set({ premiumLockPrompt }),
  setFeedbackPrefill: (feedbackPrefill) => set({ feedbackPrefill }),
  setTradingGatePrompt: (tradingGatePrompt) => set({ tradingGatePrompt }),
  setChatContext: (ctx) => set((s) => ({ chatContext: { ...s.chatContext, ...ctx } })),
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
