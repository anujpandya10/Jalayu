'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { LayoutGrid, Plus, RotateCcw, Check } from 'lucide-react'
import toast from 'react-hot-toast'
import type { Profile } from '@/lib/types'
import {
  type DashboardLayout,
  type DashboardColumn,
  type HomeWidgetId,
  getDefaultDashboardLayout,
  parseDashboardLayout,
  visibleWidgets,
  visibleMobileWidgets,
  hideWidget,
  showWidget,
  getWidgetSize,
  setWidgetSize,
  widgetSpanClass,
  WIDGET_LABELS,
  type WidgetSize,
} from '@/lib/dashboard-layout'
import HomeWidgetShell from './HomeWidgetShell'
import { useStore } from '@/store/useStore'

type ContainerId = DashboardColumn | 'mobile'

function SortableItem({
  id,
  editMode,
  size,
  onHide,
  onResize,
  children,
  className = '',
}: {
  id: HomeWidgetId
  editMode: boolean
  size: WidgetSize
  onHide: () => void
  onResize: (size: WidgetSize) => void
  children: React.ReactNode
  className?: string
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id })

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.45 : 1,
        height: '100%',         // fill the grid cell so stretch alignment works end-to-end
      }}
      className={`${className} wsize-${size}`}
    >
      <HomeWidgetShell
        id={id}
        editMode={editMode}
        size={size}
        onHide={onHide}
        onResize={onResize}
        dragHandleRef={setActivatorNodeRef}
        dragListeners={editMode ? listeners : undefined}
        dragAttributes={editMode ? attributes : undefined}
      >
        {children}
      </HomeWidgetShell>
    </div>
  )
}

function Column({
  columnId,
  title,
  items,
  editMode,
  className,
  style,
  onHide,
  onResize,
  getSize,
  renderWidget,
  useGrid,
}: {
  columnId: ContainerId
  title?: string
  items: HomeWidgetId[]
  editMode: boolean
  className?: string
  style?: React.CSSProperties
  onHide: (id: HomeWidgetId) => void
  onResize: (id: HomeWidgetId, size: WidgetSize) => void
  getSize: (id: HomeWidgetId) => WidgetSize
  renderWidget: (id: HomeWidgetId, column: ContainerId, size: WidgetSize) => React.ReactNode | null
  useGrid?: boolean
}) {
  const colClass = useGrid ? 'widget-grid-col' : ''
  return (
    <div className={`${colClass} ${className ?? ''}`.trim()} style={useGrid ? style : { display: 'flex', flexDirection: 'column', gap: 12, ...style }}>
      {editMode && title && (
        <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0, padding: '0 4px', gridColumn: useGrid ? '1 / -1' : undefined }}>
          {title}
        </p>
      )}
      <SortableContext items={items} strategy={verticalListSortingStrategy}>
        {items.map((id) => {
          const size = getSize(id)
          const node = renderWidget(id, columnId, size)
          if (!node) return null
          const spanClass = useGrid ? widgetSpanClass(size, columnId === 'mobile' ? 'center' : columnId) : ''
          return (
            <SortableItem
              key={id}
              id={id}
              editMode={editMode}
              size={size}
              className={spanClass}
              onHide={() => onHide(id)}
              onResize={(s) => onResize(id, s)}
            >
              {node}
            </SortableItem>
          )
        })}
      </SortableContext>
    </div>
  )
}

export default function CustomizableHomeGrid({
  profile,
  renderWidget,
}: {
  profile: Profile | null
  renderWidget: (id: HomeWidgetId, column: ContainerId, size: WidgetSize) => React.ReactNode | null
}) {
  const setProfile = useStore((s) => s.setProfile)
  const [layout, setLayout] = useState<DashboardLayout>(() =>
    parseDashboardLayout(profile?.dashboard_layout ?? null),
  )
  const [editMode, setEditMode] = useState(false)
  const [saving, setSaving] = useState(false)
  const [activeId, setActiveId] = useState<HomeWidgetId | null>(null)
  const [isDesktop, setIsDesktop] = useState(false)

  useEffect(() => {
    setLayout(parseDashboardLayout(profile?.dashboard_layout ?? null))
  }, [profile?.dashboard_layout])

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1100px)')
    const apply = () => setIsDesktop(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
  )

  const findContainer = useCallback(
    (id: HomeWidgetId): ContainerId | null => {
      if (layout.columns.left.includes(id)) return 'left'
      if (layout.columns.center.includes(id)) return 'center'
      if (layout.columns.right.includes(id)) return 'right'
      if (layout.mobile.includes(id)) return 'mobile'
      return null
    },
    [layout],
  )

  const leftItems = useMemo(() => visibleWidgets(layout, 'left'), [layout])
  const centerItems = useMemo(() => visibleWidgets(layout, 'center'), [layout])
  const rightItems = useMemo(() => visibleWidgets(layout, 'right'), [layout])
  const mobileItems = useMemo(() => visibleMobileWidgets(layout), [layout])

  const allActiveIds = useMemo(
    () => [...leftItems, ...centerItems, ...rightItems, ...mobileItems],
    [leftItems, centerItems, rightItems, mobileItems],
  )

  const handleDragStart = (e: DragStartEvent) => {
    setActiveId(e.active.id as HomeWidgetId)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)
    if (!over) return

    const activeWidget = active.id as HomeWidgetId
    const overId = over.id as string

    const activeContainer = findContainer(activeWidget)
    if (!activeContainer) return

    let overContainer: ContainerId | null = null
    if (overId === 'left' || overId === 'center' || overId === 'right' || overId === 'mobile') {
      overContainer = overId
    } else {
      overContainer = findContainer(overId as HomeWidgetId)
    }
    if (!overContainer) return

    setLayout((prev) => {
      const getList = (c: ContainerId) =>
        c === 'mobile' ? [...prev.mobile] : [...prev.columns[c]]

      const activeList = getList(activeContainer)
      const overList = getList(overContainer)

      const activeIndex = activeList.indexOf(activeWidget)
      if (activeIndex === -1) return prev

      let overIndex: number
      if (overId === overContainer) {
        overIndex = overList.length
      } else {
        overIndex = overList.indexOf(overId as HomeWidgetId)
        if (overIndex === -1) overIndex = overList.length
      }

      if (activeContainer === overContainer) {
        const reordered = arrayMove(activeList, activeIndex, overIndex)
        if (overContainer === 'mobile') {
          return { ...prev, mobile: reordered }
        }
        return {
          ...prev,
          columns: { ...prev.columns, [overContainer]: reordered },
        }
      }

      const next = { ...prev, columns: { ...prev.columns }, mobile: [...prev.mobile] }
      activeList.splice(activeIndex, 1)
      const insertAt = overIndex
      overList.splice(insertAt, 0, activeWidget)

      if (activeContainer === 'mobile') next.mobile = activeList
      else next.columns[activeContainer] = activeList

      if (overContainer === 'mobile') next.mobile = overList
      else next.columns[overContainer] = overList

      return next
    })
  }

  const handleHide = (id: HomeWidgetId) => {
    setLayout((prev) => hideWidget(prev, id))
    toast.success(`Hidden ${WIDGET_LABELS[id]}`)
  }

  const handleResize = (id: HomeWidgetId, size: WidgetSize) => {
    setLayout((prev) => setWidgetSize(prev, id, size))
  }

  const getSize = useCallback((id: HomeWidgetId) => getWidgetSize(layout, id), [layout])

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dashboard_layout: layout }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? 'Could not save layout')
        return
      }
      if (data.profile) setProfile(data.profile)
      setEditMode(false)
      toast.success('Dashboard saved ✦')
    } catch {
      toast.error('Could not save layout')
    } finally {
      setSaving(false)
    }
  }

  const handleReset = () => {
    if (!confirm('Reset to the focused layout?\n\nThis hides:\n• Quote, Reflection, Health, North star, Progress, Explore, Strategy Lab, Memory\n\nKeeps on home:\n• Identity, Morning note, Ask Jalayu, Schedule, Mood, Trading, Notes, Vault\n\nYou can unhide any widget from this panel. Continue?')) return
    setLayout(getDefaultDashboardLayout())
    toast.success('Switched to focused layout — tap Done to save')
  }

  const hiddenWidgets = layout.hidden

  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          marginBottom: 14,
          flexWrap: 'wrap',
        }}
      >
        {!editMode ? (
          <button
            type="button"
            onClick={() => setEditMode(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 14px',
              borderRadius: 10,
              border: '1px solid var(--border-2)',
              background: 'var(--surface)',
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--text-2)',
              cursor: 'pointer',
            }}
          >
            <LayoutGrid size={14} />
            Customize home
          </button>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)' }}>Drag · S/M/L size · ✕ hide</span>
            <button type="button" onClick={handleReset} style={toolbarBtnStyle}>
              <RotateCcw size={13} /> Use focused layout
            </button>
            <button type="button" onClick={() => setEditMode(false)} style={toolbarBtnStyle}>
              Cancel
            </button>
            <button type="button" onClick={handleSave} disabled={saving} style={{ ...toolbarBtnStyle, background: 'var(--accent)', color: '#fff', border: 'none' }}>
              <Check size={13} /> {saving ? 'Saving…' : 'Done'}
            </button>
          </div>
        )}
      </div>

      {editMode && hiddenWidgets.length > 0 && (
        <div style={{ marginBottom: 14, padding: '12px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', margin: '0 0 8px' }}>Hidden widgets</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {hiddenWidgets.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setLayout((prev) => showWidget(prev, id, 'center'))}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '5px 10px',
                  borderRadius: 8,
                  border: '1px dashed var(--border-2)',
                  background: 'var(--surface-2)',
                  fontSize: 11,
                  fontWeight: 500,
                  color: 'var(--text-2)',
                  cursor: 'pointer',
                }}
              >
                <Plus size={12} /> {WIDGET_LABELS[id]}
              </button>
            ))}
          </div>
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="home-3col">
          <Column
            columnId="left"
            title="Left"
            items={leftItems}
            editMode={editMode}
            onHide={handleHide}
            onResize={handleResize}
            getSize={getSize}
            renderWidget={renderWidget}
          />

          {isDesktop ? (
            <>
              <Column columnId="center" title="Center" items={centerItems} editMode={editMode} onHide={handleHide} onResize={handleResize} getSize={getSize} renderWidget={renderWidget} useGrid />
              <Column
                columnId="right"
                title="Right"
                items={rightItems}
                editMode={editMode}
                onHide={handleHide}
                onResize={handleResize}
                getSize={getSize}
                renderWidget={renderWidget}
                useGrid
                className="home-right"
                style={{ display: 'grid' }}
              />
            </>
          ) : (
            <Column columnId="mobile" title="Widgets" items={mobileItems} editMode={editMode} onHide={handleHide} onResize={handleResize} getSize={getSize} renderWidget={renderWidget} useGrid />
          )}
        </div>

        <DragOverlay>
          {activeId ? (
            <div style={{ opacity: 0.92, transform: 'scale(1.02)', boxShadow: '0 12px 32px rgba(0,0,0,0.12)', borderRadius: 18 }}>
              <HomeWidgetShell id={activeId} editMode>
                <div style={{ padding: 16, background: 'var(--surface)', minHeight: 48 }}>
                  {WIDGET_LABELS[activeId]}
                </div>
              </HomeWidgetShell>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </>
  )
}

const toolbarBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  padding: '7px 12px',
  borderRadius: 8,
  border: '1px solid var(--border-2)',
  background: 'var(--surface)',
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--text-2)',
  cursor: 'pointer',
}
