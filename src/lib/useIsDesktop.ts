'use client'

import { useEffect, useState } from 'react'

const DESKTOP_BREAKPOINT = 1024

/**
 * The one place that decides "wide enough for a desktop layout." Views that want
 * a side-by-side arrangement on a big screen (instead of the mobile-first single
 * stacked column) read this instead of hardcoding a media query themselves.
 */
export function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.innerWidth >= DESKTOP_BREAKPOINT,
  )
  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${DESKTOP_BREAKPOINT}px)`)
    const onChange = () => setIsDesktop(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return isDesktop
}
