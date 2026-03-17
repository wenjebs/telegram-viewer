import { useState, useCallback } from 'react'

type Theme = 'system' | 'light' | 'dark'

const CYCLE: Theme[] = ['system', 'light', 'dark']

function getStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'system'
  const stored = localStorage.getItem('theme')
  if (stored === 'light' || stored === 'dark' || stored === 'system')
    return stored
  return 'system'
}

function applyTheme(theme: Theme) {
  if (theme === 'light' || theme === 'dark') {
    document.documentElement.setAttribute('data-theme', theme)
  } else {
    document.documentElement.removeAttribute('data-theme')
  }
  localStorage.setItem('theme', theme)
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getStoredTheme)

  const cycle = useCallback(() => {
    setTheme((current) => {
      const next = CYCLE[(CYCLE.indexOf(current) + 1) % CYCLE.length]
      applyTheme(next)
      return next
    })
  }, [])

  return { theme, cycle }
}
