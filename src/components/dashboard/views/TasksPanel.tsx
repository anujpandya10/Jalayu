'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, Loader2, Plus, X } from 'lucide-react'
import type { Profile, Task } from '@/lib/types'
import { formatDate } from '@/lib/utils'

export default function TasksPanel({
  tasks,
  profile: _profile,
  onAdd,
  onToggle,
  title = "Today's tasks",
  subtitle,
}: {
  tasks: Task[]
  profile: Profile | null
  onAdd: (title: string) => Promise<void>
  onToggle: (task: Task) => Promise<void>
  title?: string
  subtitle?: string
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
          <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)', margin: 0 }}>{title}</h2>
          <p style={{ fontSize: 12, color: 'var(--text-2)', margin: '2px 0 0' }}>{subtitle ?? formatDate()}</p>
        </div>
        <button
          onClick={() => setShowInput(!showInput)}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '7px 12px', background: 'var(--accent)', color: '#fff',
            border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: 'pointer',
          }}
        >
          <Plus size={13} />
          Add task
        </button>
      </div>

      {tasks.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-2)', marginBottom: 5 }}>
            <span>{completed.length} of {tasks.length} done</span>
            <span>{progress}%</span>
          </div>
          <div style={{ height: 4, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}>
            <motion.div
              style={{ height: '100%', background: 'var(--accent)', borderRadius: 99 }}
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
              background: 'var(--surface-2)', border: '1.5px solid var(--accent)', borderRadius: 10,
            }}>
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                placeholder="What needs to happen today?"
                autoFocus
                style={{ flex: 1, fontSize: 13, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text)' }}
              />
              <button
                onClick={handleAdd}
                disabled={adding || !newTitle.trim()}
                style={{
                  background: newTitle.trim() ? 'var(--accent)' : 'var(--border)',
                  color: newTitle.trim() ? '#fff' : 'var(--text-2)',
                  border: 'none', borderRadius: 6, width: 26, height: 26,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: newTitle.trim() ? 'pointer' : 'not-allowed', flexShrink: 0,
                }}
              >
                {adding ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
              </button>
              <button
                onClick={() => { setShowInput(false); setNewTitle('') }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-2)', padding: 2 }}
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
          <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)', marginBottom: 6 }}>Nothing on the list yet</p>
          <p style={{ fontSize: 12, color: 'var(--text-2)' }}>What&apos;s the one thing you need to do today?</p>
        </div>
      )}

      {tasks.length > 0 && completed.length === tasks.length && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          style={{ textAlign: 'center', padding: '20px', borderRadius: 12, background: 'var(--success-bg)', border: '1px solid var(--border-2)', marginTop: 12 }}
        >
          <div style={{ fontSize: 24, marginBottom: 6 }}>🎉</div>
          <p style={{ fontWeight: 600, color: 'var(--success-text)', margin: 0 }}>All done for today!</p>
          <p style={{ fontSize: 12, color: 'var(--success-text)', marginTop: 4 }}>That&apos;s a full day. Give yourself credit.</p>
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
        background: task.completed ? 'var(--surface-2)' : 'var(--surface)',
        border: `1px solid ${task.completed ? 'var(--border)' : 'var(--border-2)'}`,
      }}
    >
      <button
        onClick={async () => { setToggling(true); await onToggle(task); setToggling(false) }}
        disabled={toggling}
        style={{
          width: 18, height: 18, borderRadius: 5, flexShrink: 0, cursor: 'pointer',
          border: `1.5px solid ${task.completed ? 'var(--accent)' : 'var(--border-2)'}`,
          background: task.completed ? 'var(--accent)' : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s',
        }}
      >
        {toggling
          ? <Loader2 size={9} className="animate-spin" color={task.completed ? '#fff' : 'var(--accent)'} />
          : task.completed ? <Check size={9} color="#fff" /> : null}
      </button>
      <span style={{
        fontSize: 13, flex: 1,
        color: task.completed ? 'var(--text-2)' : 'var(--text)',
        textDecoration: task.completed ? 'line-through' : 'none',
      }}>
        {task.title}
      </span>
    </motion.div>
  )
}
