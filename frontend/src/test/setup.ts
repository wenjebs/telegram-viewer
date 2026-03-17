import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach } from 'vitest'

// jsdom doesn't implement HTMLDialogElement methods
HTMLDialogElement.prototype.showModal ??= function () {}
HTMLDialogElement.prototype.close ??= function () {}

// Synchronous requestAnimationFrame for hooks that use it (useDragSelect, useLightbox)
window.requestAnimationFrame ??= (cb: FrameRequestCallback) => {
  cb(0)
  return 0
}

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  globalThis.fetch = undefined as unknown as typeof fetch
})
