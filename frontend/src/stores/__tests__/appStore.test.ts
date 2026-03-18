import { describe, it, expect, beforeEach } from 'vitest'
import { useAppStore } from '#/stores/appStore'

describe('appStore', () => {
  beforeEach(() => {
    useAppStore.setState({
      sidebarWidth: 280,
      similarityThreshold: 0.4,
      showMergeModal: false,
      showShortcuts: false,
    })
  })

  it('has correct initial defaults', () => {
    const state = useAppStore.getState()
    expect(state.sidebarWidth).toBe(280)
    expect(state.similarityThreshold).toBe(0.4)
    expect(state.showMergeModal).toBe(false)
    expect(state.showShortcuts).toBe(false)
  })

  it('setSidebarWidth updates value', () => {
    useAppStore.getState().setSidebarWidth(350)
    expect(useAppStore.getState().sidebarWidth).toBe(350)
  })

  it('setSimilarityThreshold updates value', () => {
    useAppStore.getState().setSimilarityThreshold(0.7)
    expect(useAppStore.getState().similarityThreshold).toBe(0.7)
  })

  it('setShowMergeModal updates value', () => {
    useAppStore.getState().setShowMergeModal(true)
    expect(useAppStore.getState().showMergeModal).toBe(true)
  })

  it('setShowShortcuts updates value', () => {
    useAppStore.getState().setShowShortcuts(true)
    expect(useAppStore.getState().showShortcuts).toBe(true)
  })
})
