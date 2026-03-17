import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import { useTheme } from '#/hooks/useTheme'

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
})

describe('useTheme', () => {
  it('defaults to system when localStorage is empty', () => {
    const { result } = renderHook(() => useTheme())
    expect(result.current.theme).toBe('system')
  })

  it('reads initial theme from localStorage', () => {
    localStorage.setItem('theme', 'light')
    const { result } = renderHook(() => useTheme())
    expect(result.current.theme).toBe('light')
  })

  it('cycles system → light → dark → system', () => {
    const { result } = renderHook(() => useTheme())

    act(() => result.current.cycle())
    expect(result.current.theme).toBe('light')

    act(() => result.current.cycle())
    expect(result.current.theme).toBe('dark')

    act(() => result.current.cycle())
    expect(result.current.theme).toBe('system')
  })

  it('sets data-theme attribute for light and dark', () => {
    const { result } = renderHook(() => useTheme())

    act(() => result.current.cycle()) // → light
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')

    act(() => result.current.cycle()) // → dark
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('removes data-theme attribute for system', () => {
    localStorage.setItem('theme', 'dark')
    const { result } = renderHook(() => useTheme())

    act(() => result.current.cycle()) // dark → system
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  })

  it('persists choice to localStorage', () => {
    const { result } = renderHook(() => useTheme())

    act(() => result.current.cycle()) // → light
    expect(localStorage.getItem('theme')).toBe('light')

    act(() => result.current.cycle()) // → dark
    expect(localStorage.getItem('theme')).toBe('dark')

    act(() => result.current.cycle()) // → system
    expect(localStorage.getItem('theme')).toBe('system')
  })

  it('ignores invalid localStorage values', () => {
    localStorage.setItem('theme', 'banana')
    const { result } = renderHook(() => useTheme())
    expect(result.current.theme).toBe('system')
  })
})
