import { renderHook } from '@testing-library/react'
import { vi } from 'vitest'
import type { Group } from '#/api/schemas'
import { useHomeShortcuts } from '#/hooks/useHomeShortcuts'

const hotkeyHandlers = new Map<string, Function>()

vi.mock('react-hotkeys-hook', () => ({
  useHotkeys: vi.fn((key: string, handler: Function) => {
    hotkeyHandlers.set(key, handler)
  }),
}))

vi.mock('#/stores/appStore', () => ({
  useAppStore: vi.fn((selector: Function) =>
    selector({ setShowShortcuts: mockSetShowShortcuts }),
  ),
}))

const mockSetShowShortcuts = vi.fn()

function makeGroup(overrides: Partial<Group> = {}): Group {
  return {
    id: 1,
    name: 'Test Group',
    type: 'channel',
    unread_count: 0,
    active: true,
    last_synced: null,
    hidden_at: null,
    ...overrides,
  }
}

function createParams(
  overrides: Partial<Parameters<typeof useHomeShortcuts>[0]> = {},
) {
  return {
    selectMode: overrides.selectMode ?? {
      active: false,
      exitSelectMode: vi.fn(),
    },
    personMerge: overrides.personMerge ?? {
      selectMode: {
        active: false,
        exitSelectMode: vi.fn(),
      },
    },
    lightbox: overrides.lightbox ?? {
      selectedItem: null,
      justClosedLightboxRef: { current: false },
    },
    lightboxItem: overrides.lightboxItem ?? null,
    handleViewModeChange: overrides.handleViewModeChange ?? vi.fn(),
    handleToggleHiddenDialogs: overrides.handleToggleHiddenDialogs ?? vi.fn(),
    handleHideDialog: overrides.handleHideDialog ?? vi.fn(),
    groups: overrides.groups ?? [],
    viewMode: overrides.viewMode ?? 'normal',
  }
}

beforeEach(() => {
  hotkeyHandlers.clear()
  vi.clearAllMocks()
})

describe('useHomeShortcuts', () => {
  it('escape exits person merge select mode when lightbox closed', () => {
    const exitSelectMode = vi.fn()
    const params = createParams({
      personMerge: {
        selectMode: { active: true, exitSelectMode },
      },
    })
    renderHook(() => useHomeShortcuts(params))

    const handler = hotkeyHandlers.get('escape')!
    handler()

    expect(exitSelectMode).toHaveBeenCalled()
  })

  it('escape exits media select mode when lightbox closed', () => {
    const exitSelectMode = vi.fn()
    const params = createParams({
      selectMode: { active: true, exitSelectMode },
    })
    renderHook(() => useHomeShortcuts(params))

    const handler = hotkeyHandlers.get('escape')!
    handler()

    expect(exitSelectMode).toHaveBeenCalled()
  })

  it('escape does not exit select mode when lightbox is open', () => {
    const exitSelectMode = vi.fn()
    const params = createParams({
      selectMode: { active: true, exitSelectMode },
      lightbox: {
        selectedItem: { id: 1 },
        justClosedLightboxRef: { current: false },
      },
    })
    renderHook(() => useHomeShortcuts(params))

    const handler = hotkeyHandlers.get('escape')!
    handler()

    expect(exitSelectMode).not.toHaveBeenCalled()
  })

  it('shift+slash opens shortcuts modal', () => {
    const params = createParams()
    renderHook(() => useHomeShortcuts(params))

    const handler = hotkeyHandlers.get('shift+slash')!
    handler()

    expect(mockSetShowShortcuts).toHaveBeenCalledWith(true)
  })

  it('p switches to people view mode when lightbox closed', () => {
    const handleViewModeChange = vi.fn()
    const params = createParams({ handleViewModeChange })
    renderHook(() => useHomeShortcuts(params))

    const handler = hotkeyHandlers.get('p')!
    handler()

    expect(handleViewModeChange).toHaveBeenCalledWith('people')
  })

  it('g switches to normal view mode when lightbox closed', () => {
    const handleViewModeChange = vi.fn()
    const params = createParams({ handleViewModeChange })
    renderHook(() => useHomeShortcuts(params))

    const handler = hotkeyHandlers.get('g')!
    handler()

    expect(handleViewModeChange).toHaveBeenCalledWith('normal')
  })

  it('f switches to favorites view mode when lightbox closed', () => {
    const handleViewModeChange = vi.fn()
    const params = createParams({ handleViewModeChange })
    renderHook(() => useHomeShortcuts(params))

    const handler = hotkeyHandlers.get('f')!
    handler()

    expect(handleViewModeChange).toHaveBeenCalledWith('favorites')
  })

  it('h toggles hidden view mode when lightbox closed', () => {
    const handleViewModeChange = vi.fn()
    const params = createParams({ handleViewModeChange, viewMode: 'normal' })
    renderHook(() => useHomeShortcuts(params))

    const handler = hotkeyHandlers.get('h')!
    handler()

    expect(handleViewModeChange).toHaveBeenCalledWith('hidden')
  })

  it('h switches back to normal when already in hidden mode', () => {
    const handleViewModeChange = vi.fn()
    const params = createParams({ handleViewModeChange, viewMode: 'hidden' })
    renderHook(() => useHomeShortcuts(params))

    const handler = hotkeyHandlers.get('h')!
    handler()

    expect(handleViewModeChange).toHaveBeenCalledWith('normal')
  })

  it('view mode shortcuts do not fire when lightbox is open', () => {
    const handleViewModeChange = vi.fn()
    const params = createParams({
      handleViewModeChange,
      lightboxItem: { id: 1 },
    })
    renderHook(() => useHomeShortcuts(params))

    for (const key of ['p', 'g', 'f']) {
      hotkeyHandlers.get(key)!()
    }

    expect(handleViewModeChange).not.toHaveBeenCalled()
  })

  it('shift+h toggles hidden dialogs', () => {
    const handleToggleHiddenDialogs = vi.fn()
    const params = createParams({ handleToggleHiddenDialogs })
    renderHook(() => useHomeShortcuts(params))

    const handler = hotkeyHandlers.get('shift+h')!
    handler()

    expect(handleToggleHiddenDialogs).toHaveBeenCalled()
  })

  it('shift+d hides all active groups', async () => {
    const handleHideDialog = vi.fn().mockResolvedValue(undefined)
    const groups = [
      makeGroup({ id: 1, active: true }),
      makeGroup({ id: 2, active: false }),
      makeGroup({ id: 3, active: true }),
    ]
    const params = createParams({ handleHideDialog, groups })
    renderHook(() => useHomeShortcuts(params))

    const handler = hotkeyHandlers.get('shift+d')!
    await handler()

    expect(handleHideDialog).toHaveBeenCalledTimes(2)
    expect(handleHideDialog).toHaveBeenCalledWith(groups[0])
    expect(handleHideDialog).toHaveBeenCalledWith(groups[2])
  })

  it('shift+d does nothing when lightbox is open', async () => {
    const handleHideDialog = vi.fn()
    const groups = [makeGroup({ id: 1, active: true })]
    const params = createParams({
      handleHideDialog,
      groups,
      lightboxItem: { id: 1 },
    })
    renderHook(() => useHomeShortcuts(params))

    const handler = hotkeyHandlers.get('shift+d')!
    await handler()

    expect(handleHideDialog).not.toHaveBeenCalled()
  })
})
