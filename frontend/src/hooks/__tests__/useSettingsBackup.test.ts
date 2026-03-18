import { renderHook, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { createWrapper } from '#/test/wrapper'
import { useSettingsBackup } from '#/hooks/useSettingsBackup'

describe('useSettingsBackup', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    URL.createObjectURL = vi.fn(() => 'blob:mock')
    URL.revokeObjectURL = vi.fn()
  })

  it('starts with exporting=false and importing=false', () => {
    const { result } = renderHook(() => useSettingsBackup(), {
      wrapper: createWrapper(),
    })
    expect(result.current.exporting).toBe(false)
    expect(result.current.importing).toBe(false)
  })

  it('handleExport triggers download', async () => {
    const clickSpy = vi.fn()
    const origCreate = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = origCreate(tag)
      if (tag === 'a') el.click = clickSpy
      return el
    })

    globalThis.fetch = vi.fn(
      async () =>
        new Response('{}', {
          status: 200,
          headers: {
            'Content-Disposition': 'attachment; filename="settings.json"',
            'Content-Type': 'application/json',
          },
        }),
    )

    const { result } = renderHook(() => useSettingsBackup(), {
      wrapper: createWrapper(),
    })

    await act(async () => {
      await result.current.handleExport()
    })
    expect(clickSpy).toHaveBeenCalled()
  })

  it('handleExport shows error toast on failure', async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ detail: 'Server error' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }),
    )

    const { result } = renderHook(() => useSettingsBackup(), {
      wrapper: createWrapper(),
    })

    await expect(
      act(async () => {
        await result.current.handleExport()
      }),
    ).rejects.toThrow()
  })
})
