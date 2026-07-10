export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'jalayu-theme'

/** Reads the saved theme — falls back to 'light' (dark is opt-in only, see globals.css). */
export function getStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'light'
  try {
    return localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

/** Applies the theme to <html> and persists it. Safe to call from any client component. */
export function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return
  if (theme === 'dark') document.documentElement.setAttribute('data-theme', 'dark')
  else document.documentElement.removeAttribute('data-theme')
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // localStorage unavailable (private mode etc.) — theme still applies for this session
  }
}
