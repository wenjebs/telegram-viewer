import { create } from 'zustand'

interface AppState {
  sidebarWidth: number
  setSidebarWidth: (width: number) => void
  similarityThreshold: number
  setSimilarityThreshold: (value: number) => void
  showMergeModal: boolean
  setShowMergeModal: (show: boolean) => void
  showShortcuts: boolean
  setShowShortcuts: (show: boolean) => void
}

export const useAppStore = create<AppState>((set) => ({
  sidebarWidth: 280,
  setSidebarWidth: (width) => set({ sidebarWidth: width }),
  similarityThreshold: 0.4,
  setSimilarityThreshold: (value) => set({ similarityThreshold: value }),
  showMergeModal: false,
  setShowMergeModal: (show) => set({ showMergeModal: show }),
  showShortcuts: false,
  setShowShortcuts: (show) => set({ showShortcuts: show }),
}))
