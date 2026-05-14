'use client'

import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import toast, { Toaster } from 'react-hot-toast'
import { Check, Loader2, Plus, X } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { getDayNumber, todayString, formatDate, getDisplayName } from '@/lib/utils'
import AIBar from '@/components/dashboard/AIBar'
import MoodCard from '@/components/dashboard/MoodCard'
import TasksCard from '@/components/dashboard/TasksCard'
import GoalCard from '@/components/dashboard/GoalCard'
import PeakHoursCard from '@/components/dashboard/PeakHoursCard'
import WeekChart from '@/components/dashboard/WeekChart'
import InsightCard from '@/components/dashboard/InsightCard'
import KnowledgeCard from '@/components/dashboard/KnowledgeCard'
import SetupChecklist from '@/components/dashboard/SetupChecklist'
import PatternCard from '@/components/dashboard/PatternCard'
import type { Profile, Task, Mood, Note, Reflection } from '@/lib/types'

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
    activeBottomTab,
    journeyView,
    setTodayMood,
    addTask,
    updateTask,
    addNote,
    setTodayReflection,
    setProfile,
  } = useStore()

  const daysSinceSignup = profile ? getDayNumber(profile.created_at) - 1 : 0
  const name = getDisplayName(profile)

  /* ── Mood logging ── */
  const handleMoodLog = useCallback(async (score: number) => {
    const supabase = await getSupabase()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const h = new Date().getHours()
    const { data, error } = await supabase.from('moods').insert({
      user_id: user.id,
      score,
      time_of_day: h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening',
      energy_level: score,
    }).select().single()
    if (!error && data) {
      setTodayMood(data as Mood)
      await supabase.from('profiles').update({ growth_score: (profile?.growth_score || 0) + 2 }).eq('id', user.id)
      toast.success('Mood logged ✦')
    }
  }, [profile, setTodayMood])

  /* ── Task actions ── */
  const handleAddTask = useCallback(async (title: string) => {
    const supabase = await getSupabase()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data, error } = await supabase.from('tasks').insert({
      user_id: user.id,
      title,
      due_date: todayString(),
      priority: 'medium',
    }).select().single()
    if (!error && data) {
      addTask(data as Task)
      toast.success('Task added')
    }
  }, [addTask])

  const handleToggleTask = useCallback(async (task: Task) => {
    const supabase = await getSupabase()
    const newCompleted = !task.completed
    const { error } = await supabase.from('tasks').update({
      completed: newCompleted,
      completed_at: newCompleted ? new Date().toISOString() : null,
    }).eq('id', task.id)
    if (!error) {
      updateTask(task.id, { completed: newCompleted, completed_at: newCompleted ? new Date().toISOString() : null })
      if (newCompleted) {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          await supabase.from('profiles').update({ growth_score: (profile?.growth_score || 0) + 5 }).eq('id', user.id)
        }
        toast.success('Task done! +5 growth')
      }
    }
  }, [profile, updateTask])

  /* ── Note saving ── */
  const handleSaveNote = useCallback(async (content: string) => {
    const supabase = await getSupabase()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data, error } = await supabase.from('notes').insert({
      user_id: user.id,
      content,
      type: 'note',
    }).select().single()
    if (!error && data) {
      addNote(data as Note)
      await supabase.from('profiles').update({ growth_score: (profile?.growth_score || 0) + 3 }).eq('id', user.id)
      toast.success('Saved to memory ✦')
    } else {
      toast.error('Could not save. Try again.')
    }
  }, [profile, addNote])

  /* ── Reflection saving ── */
  const handleSaveReflection = useCallback(async (reflData: { one_word: string; win_of_day: string; tomorrow_note: string }) => {
    const supabase = await getSupabase()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: saved, error } = await supabase.from('reflections').upsert({
      user_id: user.id,
      date: todayString(),
      ...reflData,
    }, { onConflict: 'user_id,date' }).select().single()
    if (!error && saved) {
      setTodayReflection(saved as Reflection)
      await supabase.from('profiles').update({ growth_score: (profile?.growth_score || 0) + 10 }).eq('id', user.id)
      toast.success('Reflection saved ✦ +10 growth')
    } else {
      toast.error('Could not save. Try again.')
    }
  }, [profile, setTodayReflection])

  return (
    <div style={{ minHeight: '100%' }}>
      <Toaster position="top-center" toastOptions={{ style: { borderRadius: 10, fontSize: 13 } }} />

      <AnimatePresence mode="wait">
        {activeBottomTab === 'home' && (
          <motion.div
            key="home"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
          >
            <AIBar />
            <HomeContent
              journeyView={journeyView}
              profile={profile}
              tasks={tasks}
              todayMood={todayMood}
              notes={notes}
              daysSinceSignup={daysSinceSignup}
              onMoodLog={handleMoodLog}
              onAddTask={handleAddTask}
              onToggleTask={handleToggleTask}
            />
          </motion.div>
        )}

        {activeBottomTab === 'tasks' && (
          <motion.div
            key="tasks"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
          >
            <TasksTabContent
              tasks={tasks}
              profile={profile}
              onAdd={handleAddTask}
              onToggle={handleToggleTask}
            />
          </motion.div>
        )}

        {activeBottomTab === 'memory' && (
          <motion.div
            key="memory"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
          >
            <MemoryTabContent notes={notes} name={name} onSave={handleSaveNote} />
          </motion.div>
        )}

        {activeBottomTab === 'reflect' && (
          <motion.div
            key="reflect"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
          >
            <ReflectTabContent todayReflection={todayReflection} onSave={handleSaveReflection} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ─── Home content with day-evolution ─── */
function HomeContent({
  journeyView,
  profile,
  tasks,
  todayMood,
  notes,
  daysSinceSignup,
  onMoodLog,
  onAddTask,
  onToggleTask,
}: {
  journeyView: string
  profile: Profile | null
  tasks: Task[]
  todayMood: Mood | null
  notes: Note[]
  daysSinceSignup: number
  onMoodLog: (score: number) => void
  onAddTask: (title: string) => Promise<void>
  onToggleTask: (task: Task) => Promise<void>
}) {
  const gridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 10,
    padding: '12px 14px',
  }

  if (journeyView === 'day1') {
    return (
      <div style={gridStyle}>
        <div style={{ gridColumn: 'span 2' }}>
          <SetupChecklist profile={profile} notes={notes} />
        </div>
        <MoodCard todayMood={todayMood} onLog={onMoodLog} />
        <GoalCard goal={profile?.biggest_goal} />
      </div>
    )
  }

  if (journeyView === 'day2') {
    return (
      <div style={gridStyle}>
        <div style={{ gridColumn: 'span 2' }}>
          <MoodCard todayMood={todayMood} onLog={onMoodLog} />
        </div>
        <div style={{ gridColumn: 'span 2' }}>
          <TasksCard tasks={tasks} profile={profile} onAdd={onAddTask} onToggle={onToggleTask} />
        </div>
        <PeakHoursCard peakHours={profile?.peak_hours} wakeTime={profile?.wake_time} />
        <GoalCard goal={profile?.biggest_goal} />
      </div>
    )
  }

  if (journeyView === 'day7') {
    return (
      <div style={gridStyle}>
        <MoodCard todayMood={todayMood} onLog={onMoodLog} />
        <PeakHoursCard peakHours={profile?.peak_hours} wakeTime={profile?.wake_time} />
        <div style={{ gridColumn: 'span 2' }}>
          <TasksCard tasks={tasks} profile={profile} onAdd={onAddTask} onToggle={onToggleTask} />
        </div>
        <WeekChart tasks={tasks} moods={[]} daysSinceSignup={daysSinceSignup} />
        <KnowledgeCard
          daysSinceSignup={daysSinceSignup}
          hasWorkType={!!profile?.work_type}
          hasPeakHours={!!profile?.peak_hours}
          moodsCount={todayMood ? 7 : 0}
          tasksCount={tasks.length}
        />
        <div style={{ gridColumn: 'span 2' }}>
          <InsightCard profile={profile} daysSinceSignup={daysSinceSignup} />
        </div>
      </div>
    )
  }

  // day30
  return (
    <div style={gridStyle}>
      <MoodCard todayMood={todayMood} onLog={onMoodLog} />
      <PeakHoursCard peakHours={profile?.peak_hours} wakeTime={profile?.wake_time} />
      <div style={{ gridColumn: 'span 2' }}>
        <TasksCard tasks={tasks} profile={profile} onAdd={onAddTask} onToggle={onToggleTask} />
      </div>
      <WeekChart tasks={tasks} moods={[]} daysSinceSignup={daysSinceSignup} />
      <InsightCard profile={profile} daysSinceSignup={daysSinceSignup} />
      <PatternCard tasks={tasks} moods={[]} daysSinceSignup={daysSinceSignup} />
    </div>
  )
}

/* ─── Tasks tab ─── */
function TasksTabContent({
  tasks,
  profile,
  onAdd,
  onToggle,
}: {
  tasks: Task[]
  profile: Profile | null
  onAdd: (title: string) => Promise<void>
  onToggle: (task: Task) => Promise<void>
}) {
  const [showInput, setShowInput] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [adding, setAdding] = useState(false)

  const completed = tasks.filter((t) => t.completed)
  const pending = tasks.filter((t) => !t.completed)
  const progress = tasks.length ? Math.round((completed.length / tasks.length) * 100) : 0

  const handleAdd = async () => {
    if (!newTitle.trim()) return
    setAdding(true)
    await onAdd(newTitle.trim())
    setNewTitle('')
    setAdding(false)
    setShowInput(false)
  }

  return (
    <div style={{ padding: '16px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: '#111827', margin: 0 }}>Today&apos;s tasks</h2>
          <p style={{ fontSize: 12, color: '#9CA3AF', margin: '2px 0 0' }}>{formatDate()}</p>
        </div>
        <button
          onClick={() => setShowInput(!showInput)}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '7px 12px', background: '#534AB7', color: '#fff',
            border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: 'pointer',
          }}
        >
          <Plus size={13} />
          Add task
        </button>
      </div>

      {tasks.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#9CA3AF', marginBottom: 5 }}>
            <span>{completed.length} of {tasks.length} done</span>
            <span>{progress}%</span>
          </div>
          <div style={{ height: 4, background: '#E5E3FF', borderRadius: 99, overflow: 'hidden' }}>
            <motion.div
              style={{ height: '100%', background: '#534AB7', borderRadius: 99 }}
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ type: 'spring', stiffness: 100 }}
            />
          </div>
        </div>
      )}

      <AnimatePresence>
        {showInput && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            style={{ overflow: 'hidden', marginBottom: 10 }}
          >
            <div style={{
              display: 'flex', gap: 6, padding: '8px 10px',
              background: '#fff', border: '1.5px solid #534AB7', borderRadius: 10,
            }}>
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                placeholder="What needs to happen today?"
                autoFocus
                style={{ flex: 1, fontSize: 13, background: 'transparent', border: 'none', outline: 'none', color: '#111827' }}
              />
              <button
                onClick={handleAdd}
                disabled={adding || !newTitle.trim()}
                style={{
                  background: newTitle.trim() ? '#534AB7' : '#E5E3FF',
                  color: newTitle.trim() ? '#fff' : '#9CA3AF',
                  border: 'none', borderRadius: 6, width: 26, height: 26,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: newTitle.trim() ? 'pointer' : 'not-allowed', flexShrink: 0,
                }}
              >
                {adding ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
              </button>
              <button
                onClick={() => { setShowInput(false); setNewTitle('') }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', padding: 2 }}
              >
                <X size={14} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div>
        <AnimatePresence initial={false}>
          {[...pending, ...completed].map((task) => (
            <FullTaskRow key={task.id} task={task} onToggle={onToggle} />
          ))}
        </AnimatePresence>
      </div>

      {tasks.length === 0 && !showInput && (
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>✦</div>
          <p style={{ fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 6 }}>Nothing on the list yet</p>
          <p style={{ fontSize: 12, color: '#9CA3AF' }}>What&apos;s the one thing you need to do today?</p>
        </div>
      )}

      {tasks.length > 0 && completed.length === tasks.length && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          style={{ textAlign: 'center', padding: '20px', borderRadius: 12, background: '#EAF3DE', border: '1px solid #c4e09c', marginTop: 12 }}
        >
          <div style={{ fontSize: 24, marginBottom: 6 }}>🎉</div>
          <p style={{ fontWeight: 600, color: '#3B6D11', margin: 0 }}>All done for today!</p>
          <p style={{ fontSize: 12, color: '#4a8a1a', marginTop: 4 }}>That&apos;s a full day. Give yourself credit.</p>
        </motion.div>
      )}
    </div>
  )
}

function FullTaskRow({ task, onToggle }: { task: Task; onToggle: (t: Task) => Promise<void> }) {
  const [toggling, setToggling] = useState(false)

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px',
        borderRadius: 10, marginBottom: 6,
        background: task.completed ? '#FAFAFA' : '#fff',
        border: `1px solid ${task.completed ? '#F0F0F0' : '#E5E3FF'}`,
      }}
    >
      <button
        onClick={async () => { setToggling(true); await onToggle(task); setToggling(false) }}
        disabled={toggling}
        style={{
          width: 18, height: 18, borderRadius: 5, flexShrink: 0, cursor: 'pointer',
          border: `1.5px solid ${task.completed ? '#534AB7' : '#D1D5DB'}`,
          background: task.completed ? '#534AB7' : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s',
        }}
      >
        {toggling
          ? <Loader2 size={9} className="animate-spin" color={task.completed ? '#fff' : '#534AB7'} />
          : task.completed ? <Check size={9} color="#fff" /> : null}
      </button>
      <span style={{
        fontSize: 13, flex: 1,
        color: task.completed ? '#9CA3AF' : '#374151',
        textDecoration: task.completed ? 'line-through' : 'none',
      }}>
        {task.title}
      </span>
    </motion.div>
  )
}

/* ─── Memory tab ─── */
function MemoryTabContent({ notes, name, onSave }: { notes: Note[]; name: string; onSave: (content: string) => Promise<void> }) {
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!content.trim()) return
    setSaving(true)
    await onSave(content.trim())
    setContent('')
    setSaving(false)
  }

  return (
    <div style={{ padding: '16px 14px' }}>
      <div style={{ marginBottom: 14 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: '#111827', margin: 0 }}>Memory</h2>
        <p style={{ fontSize: 12, color: '#9CA3AF', margin: '2px 0 0' }}>Capture anything worth remembering</p>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={`What's on your mind, ${name}? An idea, something important, a realization…`}
          rows={5}
          style={{
            width: '100%', fontSize: 13, resize: 'none', outline: 'none',
            background: 'transparent', border: 'none', color: '#374151', lineHeight: 1.7,
          }}
        />
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginTop: 10, paddingTop: 10, borderTop: '0.5px solid #F3F4F6',
        }}>
          <span style={{ fontSize: 11, color: '#9CA3AF' }}>{content.length} chars</span>
          <button
            onClick={handleSave}
            disabled={saving || !content.trim()}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px',
              background: content.trim() ? '#534AB7' : '#E5E3FF',
              color: content.trim() ? '#fff' : '#9CA3AF',
              border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 500,
              cursor: content.trim() && !saving ? 'pointer' : 'not-allowed',
            }}
          >
            {saving && <Loader2 size={12} className="animate-spin" />}
            Save to memory
          </button>
        </div>
      </div>

      {notes.length > 0 && (
        <div>
          <p style={{ fontSize: 11, fontWeight: 500, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
            Recent memories
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {notes.slice(0, 10).map((note) => (
              <div key={note.id} className="card">
                <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.6, margin: '0 0 6px' }}>
                  {note.content.length > 140 ? note.content.slice(0, 140) + '…' : note.content}
                </p>
                <p style={{ fontSize: 10, color: '#9CA3AF', margin: 0 }}>
                  {new Date(note.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {notes.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>📝</div>
          <p style={{ fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 4 }}>Your memory is empty</p>
          <p style={{ fontSize: 12, color: '#9CA3AF' }}>Start capturing things and they&apos;ll appear here</p>
        </div>
      )}
    </div>
  )
}

/* ─── Reflect tab ─── */
function ReflectTabContent({
  todayReflection,
  onSave,
}: {
  todayReflection: Reflection | null
  onSave: (data: { one_word: string; win_of_day: string; tomorrow_note: string }) => Promise<void>
}) {
  const [oneWord, setOneWord] = useState(todayReflection?.one_word || '')
  const [winOfDay, setWinOfDay] = useState(todayReflection?.win_of_day || '')
  const [tomorrowNote, setTomorrowNote] = useState(todayReflection?.tomorrow_note || '')
  const [saving, setSaving] = useState(false)

  const alreadySaved = !!todayReflection
  const hasChanges =
    oneWord !== (todayReflection?.one_word || '') ||
    winOfDay !== (todayReflection?.win_of_day || '') ||
    tomorrowNote !== (todayReflection?.tomorrow_note || '')

  const handleSave = async () => {
    if (!oneWord.trim() && !winOfDay.trim() && !tomorrowNote.trim()) {
      toast.error('Fill in at least one field')
      return
    }
    setSaving(true)
    await onSave({ one_word: oneWord.trim(), win_of_day: winOfDay.trim(), tomorrow_note: tomorrowNote.trim() })
    setSaving(false)
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', fontSize: 13, outline: 'none',
    background: 'transparent', border: 'none', color: '#374151',
  }

  return (
    <div style={{ padding: '16px 14px' }}>
      <div style={{ marginBottom: 14 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: '#111827', margin: 0 }}>End of day reflection</h2>
        <p style={{ fontSize: 12, color: '#9CA3AF', margin: '2px 0 0' }}>Takes 2 minutes. Builds your life archive.</p>
      </div>

      {alreadySaved && !hasChanges && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 10, background: '#EAF3DE', border: '1px solid #c4e09c', marginBottom: 14 }}
        >
          <Check size={13} color="#3B6D11" />
          <p style={{ fontSize: 13, fontWeight: 500, color: '#3B6D11', margin: 0 }}>Today&apos;s reflection is saved ✦</p>
        </motion.div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
        <div className="card">
          <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: '#534AB7', marginBottom: 6 }}>One word for today</label>
          <input
            type="text"
            value={oneWord}
            onChange={(e) => setOneWord(e.target.value)}
            placeholder="e.g. Focused, chaotic, grateful…"
            style={inputStyle}
          />
        </div>
        <div className="card">
          <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: '#534AB7', marginBottom: 6 }}>Win of the day</label>
          <input
            type="text"
            value={winOfDay}
            onChange={(e) => setWinOfDay(e.target.value)}
            placeholder="Even the smallest thing counts…"
            style={inputStyle}
          />
        </div>
        <div className="card">
          <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: '#534AB7', marginBottom: 6 }}>What does tomorrow-you need to know?</label>
          <textarea
            value={tomorrowNote}
            onChange={(e) => setTomorrowNote(e.target.value)}
            placeholder="A reminder, a priority, something to carry forward…"
            rows={3}
            style={{ ...inputStyle, resize: 'none', lineHeight: 1.6 }}
          />
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        style={{
          width: '100%', padding: '13px', background: '#534AB7', color: '#fff',
          border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 500,
          cursor: saving ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}
      >
        {saving && <Loader2 size={14} className="animate-spin" />}
        {alreadySaved ? 'Update reflection ✦' : 'Save reflection ✦'}
      </button>

      <p style={{ textAlign: 'center', fontSize: 11, color: '#9CA3AF', marginTop: 12 }}>
        Your reflections are private and build your personal life archive over time
      </p>
    </div>
  )
}
