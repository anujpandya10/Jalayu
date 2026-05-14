'use client'

import { useState } from 'react'
import { CheckSquare, Check, Loader2, Plus } from 'lucide-react'
import { CardHeader } from '@/components/ui/Card'
import { motion, AnimatePresence } from 'framer-motion'
import type { Task, Profile } from '@/lib/types'

interface TasksCardProps {
  tasks: Task[]
  profile: Profile | null
  onAdd: (title: string) => Promise<void>
  onToggle: (task: Task) => Promise<void>
}

export default function TasksCard({ tasks, profile, onAdd, onToggle }: TasksCardProps) {
  const [showInput, setShowInput] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [adding, setAdding] = useState(false)

  const completed = tasks.filter((t) => t.completed).length
  const pending = tasks.filter((t) => !t.completed)
  const done = tasks.filter((t) => t.completed)

  const handleAdd = async () => {
    if (!newTitle.trim()) return
    setAdding(true)
    await onAdd(newTitle.trim())
    setNewTitle('')
    setAdding(false)
    setShowInput(false)
  }

  const structureInsight = (() => {
    const s = (profile?.day_structure || '').toLowerCase()
    if (s.includes('very structured')) return '✓ Use time-blocking to protect your focus.'
    if (s.includes('somewhat')) return '✓ Prioritize your top 3 tasks for today.'
    if (s.includes('chaotic')) return '✓ Even 1 completed task counts as a win.'
    return '✓ Capture what matters most before it slips.'
  })()

  return (
    <div className="card">
      <CardHeader
        icon={<CheckSquare size={13} />}
        label="Today's focus"
        right={
          <button
            onClick={() => setShowInput(!showInput)}
            style={{
              fontSize: 12,
              color: '#534AB7',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: 3,
            }}
          >
            <Plus size={12} />
            Add
          </button>
        }
      />

      {/* Progress */}
      {tasks.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div
            style={{
              height: 3,
              background: '#E5E3FF',
              borderRadius: 99,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${Math.round((completed / tasks.length) * 100)}%`,
                background: '#534AB7',
                borderRadius: 99,
                transition: 'width 0.4s ease',
              }}
            />
          </div>
          <p style={{ fontSize: 10, color: '#9CA3AF', margin: '4px 0 0' }}>
            {completed} of {tasks.length} done
          </p>
        </div>
      )}

      {/* Add task input */}
      <AnimatePresence>
        {showInput && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            style={{ overflow: 'hidden', marginBottom: 8 }}
          >
            <div
              style={{
                display: 'flex',
                gap: 6,
                padding: '7px 10px',
                background: '#F8F7FF',
                border: '1px solid #534AB7',
                borderRadius: 8,
              }}
            >
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                placeholder="What needs to happen today?"
                autoFocus
                style={{
                  flex: 1,
                  fontSize: 12,
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: '#111827',
                }}
              />
              <button
                onClick={handleAdd}
                disabled={adding || !newTitle.trim()}
                style={{
                  background: newTitle.trim() ? '#534AB7' : '#E5E3FF',
                  color: newTitle.trim() ? '#fff' : '#9CA3AF',
                  border: 'none',
                  borderRadius: 6,
                  width: 22,
                  height: 22,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: newTitle.trim() ? 'pointer' : 'not-allowed',
                  flexShrink: 0,
                }}
              >
                {adding ? (
                  <Loader2 size={11} className="animate-spin" />
                ) : (
                  <Check size={11} />
                )}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Task list */}
      <div style={{ marginBottom: 10 }}>
        <AnimatePresence initial={false}>
          {[...pending, ...done].slice(0, 6).map((task) => (
            <TaskRow key={task.id} task={task} onToggle={onToggle} />
          ))}
        </AnimatePresence>

        {tasks.length === 0 && !showInput && (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <p style={{ fontSize: 12, color: '#9CA3AF', margin: 0 }}>
              Your journey starts today ✦
            </p>
          </div>
        )}
      </div>

      {/* Insight */}
      <div
        style={{
          background: '#EAF3DE',
          borderRadius: 8,
          padding: '7px 10px',
        }}
      >
        <p style={{ fontSize: 10, color: '#27500A', margin: 0 }}>{structureInsight}</p>
      </div>
    </div>
  )
}

function TaskRow({
  task,
  onToggle,
}: {
  task: Task
  onToggle: (t: Task) => Promise<void>
}) {
  const [toggling, setToggling] = useState(false)

  const handleToggle = async () => {
    setToggling(true)
    await onToggle(task)
    setToggling(false)
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 0',
        borderBottom: '0.5px solid #F3F4F6',
      }}
    >
      <button
        onClick={handleToggle}
        disabled={toggling}
        style={{
          width: 14,
          height: 14,
          borderRadius: 4,
          border: `1.5px solid ${task.completed ? '#534AB7' : '#D1D5DB'}`,
          background: task.completed ? '#534AB7' : 'transparent',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          flexShrink: 0,
          transition: 'all 0.15s',
        }}
      >
        {toggling ? (
          <Loader2 size={8} className="animate-spin" color={task.completed ? '#fff' : '#534AB7'} />
        ) : task.completed ? (
          <Check size={8} color="#fff" />
        ) : null}
      </button>
      <span
        style={{
          fontSize: 12,
          color: task.completed ? '#9CA3AF' : '#374151',
          textDecoration: task.completed ? 'line-through' : 'none',
          flex: 1,
        }}
      >
        {task.title}
      </span>
    </motion.div>
  )
}
