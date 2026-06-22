'use client'

import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  label?: string
}
interface State {
  hasError: boolean
}

/**
 * Isolates the chart/cockpit widgets. If anything inside throws (a charting
 * library quirk, a bad data shape), this shows a small fallback instead of
 * crashing the whole dashboard — the failure mode we hit earlier.
 */
export default class ChartErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: unknown) {
    console.error('[cockpit] widget crashed (contained by boundary):', error)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: 16, borderRadius: 12, textAlign: 'center',
          border: '1px dashed var(--border)', background: 'var(--morning)',
          fontSize: 12.5, color: 'var(--text-3)', lineHeight: 1.5,
        }}>
          {this.props.label ?? 'This widget'} couldn&apos;t render right now.
          <button
            type="button"
            onClick={() => this.setState({ hasError: false })}
            style={{
              display: 'block', margin: '8px auto 0', background: 'none', border: 'none',
              padding: 0, fontSize: 12, fontWeight: 600, color: 'var(--accent)',
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
