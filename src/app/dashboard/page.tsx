'use client'

import { useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import toast, { Toaster } from 'react-hot-toast'
import { useStore } from '@/store/useStore'
import { getDayNumber, todayString, getDisplayName } from '@/lib/utils'
import AIBar from '@/components/dashboard/AIBar'
import HomeContent from '@/components/dashboard/views/HomeContent'
import MyDayView from '@/components/dashboard/views/MyDayView'
import RemindersView from '@/components/dashboard/views/RemindersView'
import MindView from '@/components/dashboard/views/MindView'
import LearningView from '@/components/dashboard/views/LearningView'
import MemoryView from '@/components/dashboard/views/MemoryView'
import NotesView from '@/components/dashboard/views/NotesView'
import VaultView from '@/components/dashboard/views/VaultView'
import ProgressView from '@/components/dashboard/views/ProgressView'
import WellnessView from '@/components/dashboard/views/WellnessView'
import PeopleView from '@/components/dashboard/views/PeopleView'
import WidgetsView from '@/components/dashboard/views/WidgetsView'
import MeetingsView from '@/components/dashboard/views/MeetingsView'
import InsightsView from '@/components/dashboard/views/InsightsView'
import HealthView from '@/components/dashboard/views/HealthView'
import UnifiedCalendarView from '@/components/dashboard/views/UnifiedCalendarView'
import TradingView from '@/components/dashboard/views/TradingView'
import StrategyLabView from '@/components/dashboard/views/StrategyLabView'
import SettingsView from '@/components/dashboard/views/SettingsView'
import type { Task, Mood, Note, Reflection, Reminder } from '@/lib/types'
import { applyAiActions } from '@/lib/apply-ai-actions'

async function getSupabase() {
  const { createClient } = await import('@/lib/supabase')
  return createClient()
}

export default function DashboardPage() {
  const {
    profile,
    tasks,
    todayMood,
    notes,
    todayReflection,
    sidebarView,
    journeyView,
    reminders,
    moodsRecent,
    tasksRecent,
    reflectionsRecent,
    insights,
    healthProfiles,
    medications,
    healthAppointments,
    medicalRecords,
    setTodayMood,
    setMoodsRecent,
    addTask,
    updateTask,
    removeTask,
    addNote,
    setTodayReflection,
    setReflectionsRecent,
    setProfile,
    addReminder,
    updateReminder,
  } = useStore()

  const daysSinceSignup = profile ? getDayNumber(profile.created_at) - 1 : 0
  const name = getDisplayName(profile)

  const handleMoodLog = useCallback(
    async (score: number) => {
      const supabase = await getSupabase()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return
      const h = new Date().getHours()
      let data: Mood | null = null
      let error: unknown = null
      const currentMood = useStore.getState().todayMood
      if (currentMood?.id) {
        // UPDATE existing today's mood
        const res = await supabase.from('moods').update({ score }).eq('id', currentMood.id).select().single()
        data = res.data as Mood | null
        error = res.error
      } else {
        // INSERT new mood
        const res = await supabase
          .from('moods')
          .insert({
            user_id: user.id,
            score,
            time_of_day: h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening',
            energy_level: score,
          })
          .select()
          .single()
        data = res.data as Mood | null
        error = res.error
      }
      if (!error && data) {
        setTodayMood(data)
        setMoodsRecent([data, ...useStore.getState().moodsRecent.filter((m) => m.id !== data!.id)].slice(0, 60))
        toast.success('Mood logged ✦')
      }
    },
    [setTodayMood, setMoodsRecent],
  )

  const handleAction = useCallback(
    (actions: Array<{ type: string; data: Record<string, unknown>; message: string }>) => {
      applyAiActions(actions)
    },
    [],
  )

  const handleAddTask = useCallback(
    async (title: string, date?: string, eventType?: string) => {
      const supabase = await getSupabase()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      let dueDate = todayString()
      let dueTime: string | null = null
      if (date) {
        if (date.includes('T')) {
          const [d, t] = date.split('T')
          dueDate = d
          dueTime = t?.slice(0, 5) || null
        } else {
          dueDate = date.slice(0, 10)
        }
      }

      if (eventType === 'reminder') {
        const local = new Date(`${dueDate}T${dueTime || '09:00'}:00`)
        const { data, error } = await supabase
          .from('reminders')
          .insert({
            user_id: user.id,
            title,
            remind_at: local.toISOString(),
            is_active: true,
          })
          .select()
          .single()
        if (!error && data) {
          addReminder(data as Reminder)
          toast.success('Reminder added ✦')
        } else {
          toast.error('Could not save reminder')
        }
        return
      }

      const { data, error } = await supabase
        .from('tasks')
        .insert({
          user_id: user.id,
          title,
          due_date: dueDate,
          due_time: dueTime,
          priority: 'medium',
          event_type: eventType || 'task',
        })
        .select()
        .single()
      if (!error && data) {
        addTask(data as Task)
        toast.success('Added ✦')
      } else if (error) {
        console.error('[handleAddTask] DB error:', error)
        toast.error(`Could not save: ${error.message}`)
      }
    },
    [addTask, addReminder],
  )

  const handleToggleTask = useCallback(
    async (task: Task) => {
      const supabase = await getSupabase()
      const newCompleted = !task.completed
      const { error } = await supabase
        .from('tasks')
        .update({
          completed: newCompleted,
          completed_at: newCompleted ? new Date().toISOString() : null,
        })
        .eq('id', task.id)
      if (!error) {
        updateTask(task.id, {
          completed: newCompleted,
          completed_at: newCompleted ? new Date().toISOString() : null,
        })
        if (newCompleted) {
          const {
            data: { user },
          } = await supabase.auth.getUser()
          if (user) {
            await supabase
              .from('profiles')
              .update({ growth_score: (profile?.growth_score || 0) + 5 })
              .eq('id', user.id)
          }
          toast.success('Task done! +5 growth')
        }
      }
    },
    [profile, updateTask],
  )

  const handleDeleteTask = useCallback(
    async (taskId: string) => {
      const supabase = await getSupabase()
      const { error } = await supabase.from('tasks').delete().eq('id', taskId)
      if (!error) {
        removeTask(taskId)
        toast.success('Deleted ✦')
      } else {
        toast.error('Could not delete. Try again.')
      }
    },
    [removeTask],
  )

  const handleEditTask = useCallback(
    async (taskId: string, newTitle: string) => {
      const supabase = await getSupabase()
      const { error } = await supabase.from('tasks').update({ title: newTitle }).eq('id', taskId)
      if (!error) {
        updateTask(taskId, { title: newTitle })
      } else {
        toast.error('Could not update. Try again.')
      }
    },
    [updateTask],
  )

  const handleSaveNote = useCallback(
    async (content: string) => {
      const supabase = await getSupabase()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return
      const { data, error } = await supabase
        .from('notes')
        .insert({
          user_id: user.id,
          content,
          type: 'note',
        })
        .select()
        .single()
      if (!error && data) {
        addNote(data as Note)
        await supabase
          .from('profiles')
          .update({ growth_score: (profile?.growth_score || 0) + 3 })
          .eq('id', user.id)
        toast.success('Saved to memory ✦')
      } else {
        toast.error('Could not save. Try again.')
      }
    },
    [profile, addNote],
  )

  const handleSaveTypedNote = useCallback(
    async (content: string, type: string, tags: string[] | null = null) => {
      const supabase = await getSupabase()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return
      const { data, error } = await supabase
        .from('notes')
        .insert({
          user_id: user.id,
          content,
          type,
          tags,
        })
        .select()
        .single()
      if (!error && data) {
        addNote(data as Note)
        await supabase
          .from('profiles')
          .update({ growth_score: (profile?.growth_score || 0) + 3 })
          .eq('id', user.id)
        toast.success('Saved ✦')
      } else {
        toast.error('Could not save. Try again.')
      }
    },
    [profile, addNote],
  )

  const handleSaveReflection = useCallback(
    async (reflData: { one_word: string; win_of_day: string; tomorrow_note: string }) => {
      try {
        const res = await fetch('/api/reflections', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(reflData),
        })
        const data = await res.json()
        if (!res.ok || !data.reflection) {
          toast.error(data.error ?? 'Could not save. Try again.')
          return
        }
        const saved = data.reflection as Reflection
        setTodayReflection(saved)
        const recent = useStore.getState().reflectionsRecent
        setReflectionsRecent([saved, ...recent.filter((r) => r.date !== saved.date)])
        if (profile && data.growth_score != null) {
          setProfile({ ...profile, growth_score: data.growth_score })
        }
        toast.success(data.is_update ? 'Reflection updated ✦' : 'Reflection saved ✦ +10 growth')
      } catch {
        toast.error('Could not save. Try again.')
      }
    },
    [profile, setTodayReflection, setReflectionsRecent, setProfile],
  )

  const viewContent = (() => {
    switch (sidebarView) {
      case 'dashboard':
        return (
          <>
            <AIBar />
            <HomeContent
              journeyView={journeyView}
              profile={profile}
              tasks={[...tasks, ...tasksRecent].filter((t, i, arr) => arr.findIndex((x) => x.id === t.id) === i)}
              reminders={reminders}
              tasksRecent={tasksRecent}
              todayMood={todayMood}
              notes={notes}
              moodsRecent={moodsRecent}
              daysSinceSignup={daysSinceSignup}
              onMoodLog={handleMoodLog}
              onAddTask={handleAddTask}
              onToggleTask={handleToggleTask}
              onAction={handleAction}
            />
          </>
        )
      case 'calendar':
        return (
          <UnifiedCalendarView
            tasks={[...tasks, ...tasksRecent].filter((t, i, arr) => arr.findIndex((x) => x.id === t.id) === i)}
            reminders={reminders}
            healthAppointments={healthAppointments}
            onAddTask={handleAddTask}
            onToggleTask={handleToggleTask}
            onDeleteTask={handleDeleteTask}
            onEditTask={handleEditTask}
          />
        )
      case 'reminders':
        return (
          <UnifiedCalendarView
            tasks={[...tasks, ...tasksRecent].filter((t, i, arr) => arr.findIndex((x) => x.id === t.id) === i)}
            reminders={reminders}
            healthAppointments={healthAppointments}
            onAddTask={handleAddTask}
            onToggleTask={handleToggleTask}
            onDeleteTask={handleDeleteTask}
            onEditTask={handleEditTask}
          />
        )
      case 'mind':
        return <MindView notes={notes} name={name} onSaveMind={(c) => handleSaveTypedNote(c, 'mind')} />
      case 'meetings':
        return <MeetingsView />
      case 'learning':
        return (
          <LearningView notes={notes} name={name} onSaveLearning={(c) => handleSaveTypedNote(c, 'learning')} />
        )
      case 'notes':
        return <NotesView name={name} />
      case 'vault':
        return <VaultView />
      case 'memory':
        return (
          <MemoryView
            notes={notes}
            reflections={reflectionsRecent}
            todayReflection={todayReflection}
            name={name}
            onSaveNote={handleSaveNote}
            onSaveReflection={handleSaveReflection}
          />
        )
      case 'progress':
        return (
          <ProgressView profile={profile} moodsRecent={moodsRecent} tasksRecent={tasksRecent} insights={insights} />
        )
      case 'wellness':
        return (
          <WellnessView todayMood={todayMood} moodsRecent={moodsRecent} onMoodLog={handleMoodLog} />
        )
      case 'people':
        return (
          <PeopleView
            notes={notes}
            name={name}
            onSavePeopleNote={(c) => handleSaveTypedNote(c, 'people', ['people'])}
          />
        )
      case 'widgets':
        return <WidgetsView />
      case 'insights':
        return <InsightsView insights={insights} />
      case 'health':
        return (
          <HealthView
            healthProfiles={healthProfiles}
            medications={medications}
            appointments={healthAppointments}
            records={medicalRecords}
          />
        )
      case 'trading':
        return <TradingView />
      case 'strategylab':
        return <StrategyLabView />
      case 'settings':
        return <SettingsView />
      default:
        return null
    }
  })()

  return (
    <div className="dashboard-view-root" style={{ minHeight: '100%', minWidth: 0 }}>
      <Toaster position="top-center" toastOptions={{ style: { borderRadius: 10, fontSize: 13 } }} />

      <AnimatePresence mode="wait">
        <motion.div
          key={sidebarView}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.18 }}
          style={{ minWidth: 0 }}
        >
          {viewContent}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
