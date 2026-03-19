# Lightbox Loading States Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add progressive loading states to the lightbox so users see a skeleton, then thumbnail, then full-res image with a smooth crossfade — instead of a blank dark backdrop.

**Architecture:** Extract a `LightboxMedia` component from `Lightbox.tsx` that manages three visual layers (skeleton, thumbnail, full-res) using stacked elements and `onLoad`/`onLoadedData` browser events. CSS transitions handle crossfade. No new APIs or schema changes.

**Tech Stack:** React 19, Tailwind CSS v4, Vitest + React Testing Library

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `frontend/src/components/LightboxMedia.tsx` | Create | Media display with loading states (skeleton → thumbnail → full-res), crossfade transitions, loading indicator pill, error/retry |
| `frontend/src/components/Lightbox.tsx` | Modify (lines 142-155) | Replace inline `<img>`/`<video>` with `<LightboxMedia>` |
| `frontend/src/components/__tests__/LightboxMedia.test.tsx` | Create | Unit tests for all loading states and transitions |
| `frontend/src/components/__tests__/Lightbox.test.tsx` | Modify | Update existing tests for new media rendering structure |

---

### Task 1: Create LightboxMedia Component — Skeleton State

**Files:**
- Create: `frontend/src/components/__tests__/LightboxMedia.test.tsx`
- Create: `frontend/src/components/LightboxMedia.tsx`

- [ ] **Step 1: Write failing tests for skeleton state**

```tsx
// frontend/src/components/__tests__/LightboxMedia.test.tsx
import { render, screen } from '@testing-library/react'
import LightboxMedia from '#/components/LightboxMedia'
import { makeMediaItem } from '#/test/fixtures'

describe('LightboxMedia', () => {
  describe('skeleton state', () => {
    it('shows skeleton when no thumbnail or full image loaded', () => {
      const item = makeMediaItem({ thumbnail_path: null })
      const { container } = render(<LightboxMedia item={item} />)
      const skeleton = container.querySelector('[data-testid="lightbox-skeleton"]')
      expect(skeleton).toBeTruthy()
    })

    it('uses item dimensions for skeleton aspect ratio', () => {
      const item = makeMediaItem({
        thumbnail_path: null,
        width: 1920,
        height: 1080,
      })
      const { container } = render(<LightboxMedia item={item} />)
      const skeleton = container.querySelector('[data-testid="lightbox-skeleton"]')
      expect(skeleton).toBeTruthy()
      // 1920/1080 ≈ 1.78 aspect ratio
      const style = skeleton?.getAttribute('style')
      expect(style).toContain('aspect-ratio')
    })

    it('falls back to 4:3 when dimensions are null', () => {
      const item = makeMediaItem({
        thumbnail_path: null,
        width: null,
        height: null,
      })
      const { container } = render(<LightboxMedia item={item} />)
      const skeleton = container.querySelector('[data-testid="lightbox-skeleton"]')
      const style = skeleton?.getAttribute('style')
      expect(style).toContain('1.333')
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && bun run vitest run src/components/__tests__/LightboxMedia.test.tsx`
Expected: FAIL — module `#/components/LightboxMedia` not found

- [ ] **Step 3: Implement skeleton state**

```tsx
// frontend/src/components/LightboxMedia.tsx
import { useState, useCallback } from 'react'
import type { MediaItem } from '#/api/schemas'
import { getThumbnailUrl, getDownloadUrl } from '#/api/client'

interface Props {
  item: MediaItem
}

export default function LightboxMedia({ item }: Props) {
  const [thumbLoaded, setThumbLoaded] = useState(false)
  const [fullLoaded, setFullLoaded] = useState(false)

  const aspectRatio =
    item.width && item.height ? item.width / item.height : 4 / 3

  const showSkeleton = !thumbLoaded && !fullLoaded

  return (
    <div className="relative flex items-center justify-center">
      {showSkeleton && (
        <div
          data-testid="lightbox-skeleton"
          className="max-h-[85vh] max-w-[90vw] rounded"
          style={{
            aspectRatio,
            width: '60vw',
            backgroundImage:
              'linear-gradient(90deg, transparent 0%, var(--color-surface-alt) 50%, transparent 100%)',
            backgroundSize: '200% 100%',
            animation: 'shimmer 1.8s ease-in-out infinite',
            backgroundColor: 'var(--color-surface-strong)',
          }}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && bun run vitest run src/components/__tests__/LightboxMedia.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/LightboxMedia.tsx frontend/src/components/__tests__/LightboxMedia.test.tsx
git commit -m "feat: add LightboxMedia component with skeleton state"
```

---

### Task 2: Add Thumbnail Layer with Loading Indicator Pill

**Files:**
- Modify: `frontend/src/components/__tests__/LightboxMedia.test.tsx`
- Modify: `frontend/src/components/LightboxMedia.tsx`

- [ ] **Step 1: Write failing tests for thumbnail state**

Add to the existing test file:

```tsx
describe('thumbnail state', () => {
  it('renders thumbnail img when item has thumbnail_path', () => {
    const item = makeMediaItem({ thumbnail_path: '/thumbs/1.jpg' })
    const { container } = render(<LightboxMedia item={item} />)
    const thumbImg = container.querySelector(
      'img[data-testid="lightbox-thumbnail"]',
    )
    expect(thumbImg).toBeTruthy()
    expect(thumbImg?.getAttribute('src')).toContain('/thumbnail')
  })

  it('shows loading indicator when thumbnail loaded but full not loaded', () => {
    const item = makeMediaItem({ thumbnail_path: '/thumbs/1.jpg' })
    const { container } = render(<LightboxMedia item={item} />)
    // Simulate thumbnail load
    const thumbImg = container.querySelector(
      'img[data-testid="lightbox-thumbnail"]',
    )
    fireEvent.load(thumbImg!)
    expect(
      screen.getByText('Loading full resolution'),
    ).toBeTruthy()
  })

  it('hides skeleton after thumbnail loads', () => {
    const item = makeMediaItem({ thumbnail_path: '/thumbs/1.jpg' })
    const { container } = render(<LightboxMedia item={item} />)
    const thumbImg = container.querySelector(
      'img[data-testid="lightbox-thumbnail"]',
    )
    fireEvent.load(thumbImg!)
    const skeleton = container.querySelector(
      '[data-testid="lightbox-skeleton"]',
    )
    expect(skeleton).toBeFalsy()
  })
})
```

Add `fireEvent` to the import:

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && bun run vitest run src/components/__tests__/LightboxMedia.test.tsx`
Expected: FAIL — thumbnail img not rendered, loading indicator not found

- [ ] **Step 3: Add thumbnail layer and loading indicator pill**

Update `LightboxMedia.tsx` — replace the return statement:

```tsx
export default function LightboxMedia({ item }: Props) {
  const [thumbLoaded, setThumbLoaded] = useState(false)
  const [fullLoaded, setFullLoaded] = useState(false)

  const isVideo = item.media_type === 'video'
  const thumbnailUrl = getThumbnailUrl(item.id, item.date)
  const downloadUrl = getDownloadUrl(item.id, item.date)
  const aspectRatio =
    item.width && item.height ? item.width / item.height : 4 / 3
  const showSkeleton = !thumbLoaded && !fullLoaded
  const showIndicator = thumbLoaded && !fullLoaded

  const handleThumbLoad = useCallback(() => setThumbLoaded(true), [])

  return (
    <div className="relative flex items-center justify-center">
      {/* Skeleton */}
      {showSkeleton && (
        <div
          data-testid="lightbox-skeleton"
          className="max-h-[85vh] max-w-[90vw] rounded"
          style={{
            aspectRatio,
            width: '60vw',
            backgroundImage:
              'linear-gradient(90deg, transparent 0%, var(--color-surface-alt) 50%, transparent 100%)',
            backgroundSize: '200% 100%',
            animation: 'shimmer 1.8s ease-in-out infinite',
            backgroundColor: 'var(--color-surface-strong)',
          }}
        />
      )}

      {/* Thumbnail layer */}
      {item.thumbnail_path && (
        <img
          data-testid="lightbox-thumbnail"
          src={thumbnailUrl}
          alt=""
          onLoad={handleThumbLoad}
          className={`max-h-[85vh] max-w-[90vw] rounded object-contain ${
            showSkeleton ? 'absolute inset-0 m-auto' : ''
          }`}
          style={{
            opacity: fullLoaded ? 0 : 1,
            transition: 'opacity 300ms ease-out',
          }}
        />
      )}

      {/* Loading indicator pill */}
      {showIndicator && (
        <div
          data-testid="lightbox-loading-indicator"
          className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-white/[0.08] px-3 py-1.5"
          style={{
            background: 'rgba(0, 0, 0, 0.6)',
            backdropFilter: 'blur(8px)',
          }}
        >
          <div
            className="h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-white/15 border-t-white/60"
          />
          <span className="text-[11px] text-white/50">
            Loading full resolution
          </span>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && bun run vitest run src/components/__tests__/LightboxMedia.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/LightboxMedia.tsx frontend/src/components/__tests__/LightboxMedia.test.tsx
git commit -m "feat: add thumbnail layer and loading indicator pill to LightboxMedia"
```

---

### Task 3: Add Full-Resolution Layer with Crossfade

**Files:**
- Modify: `frontend/src/components/__tests__/LightboxMedia.test.tsx`
- Modify: `frontend/src/components/LightboxMedia.tsx`

- [ ] **Step 1: Write failing tests for full-res crossfade**

Add to the test file:

```tsx
describe('full resolution state', () => {
  it('renders full-res img with opacity 0 initially', () => {
    const item = makeMediaItem()
    const { container } = render(<LightboxMedia item={item} />)
    const fullImg = container.querySelector(
      'img[data-testid="lightbox-full"]',
    )
    expect(fullImg).toBeTruthy()
    expect(fullImg?.style.opacity).toBe('0')
  })

  it('sets full-res opacity to 1 after onLoad fires', () => {
    const item = makeMediaItem()
    const { container } = render(<LightboxMedia item={item} />)
    const fullImg = container.querySelector(
      'img[data-testid="lightbox-full"]',
    )
    fireEvent.load(fullImg!)
    expect(fullImg?.style.opacity).toBe('1')
  })

  it('hides loading indicator after full-res loads', () => {
    const item = makeMediaItem({ thumbnail_path: '/thumbs/1.jpg' })
    const { container } = render(<LightboxMedia item={item} />)
    // Load thumbnail first
    const thumbImg = container.querySelector(
      'img[data-testid="lightbox-thumbnail"]',
    )
    fireEvent.load(thumbImg!)
    expect(screen.getByText('Loading full resolution')).toBeTruthy()
    // Now load full-res
    const fullImg = container.querySelector(
      'img[data-testid="lightbox-full"]',
    )
    fireEvent.load(fullImg!)
    expect(screen.queryByText('Loading full resolution')).toBeFalsy()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && bun run vitest run src/components/__tests__/LightboxMedia.test.tsx`
Expected: FAIL — `lightbox-full` not found

- [ ] **Step 3: Add full-resolution image layer**

Add the full-res `<img>` to `LightboxMedia.tsx`, after the thumbnail `<img>` and before the loading indicator:

```tsx
const handleFullLoad = useCallback(() => setFullLoaded(true), [])

// ... inside the return, after the thumbnail img:

{/* Full-resolution layer */}
{!isVideo && (
  <img
    data-testid="lightbox-full"
    src={downloadUrl}
    alt={item.caption || ''}
    onLoad={handleFullLoad}
    className={`max-h-[85vh] max-w-[90vw] rounded object-contain ${
      thumbLoaded ? 'absolute inset-0 m-auto' : ''
    }`}
    style={{
      opacity: fullLoaded ? 1 : 0,
      transition: 'opacity 300ms ease-out',
    }}
  />
)}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && bun run vitest run src/components/__tests__/LightboxMedia.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/LightboxMedia.tsx frontend/src/components/__tests__/LightboxMedia.test.tsx
git commit -m "feat: add full-resolution layer with crossfade transition"
```

---

### Task 4: Add Video Support

**Files:**
- Modify: `frontend/src/components/__tests__/LightboxMedia.test.tsx`
- Modify: `frontend/src/components/LightboxMedia.tsx`

- [ ] **Step 1: Write failing tests for video handling**

```tsx
describe('video handling', () => {
  it('renders video element for video items', () => {
    const item = makeMediaItem({ media_type: 'video' })
    const { container } = render(<LightboxMedia item={item} />)
    const video = container.querySelector(
      'video[data-testid="lightbox-full-video"]',
    )
    expect(video).toBeTruthy()
    expect(video?.getAttribute('src')).toContain('/download')
  })

  it('shows thumbnail while video loads', () => {
    const item = makeMediaItem({
      media_type: 'video',
      thumbnail_path: '/thumbs/1.jpg',
    })
    const { container } = render(<LightboxMedia item={item} />)
    const thumbImg = container.querySelector(
      'img[data-testid="lightbox-thumbnail"]',
    )
    expect(thumbImg).toBeTruthy()
  })

  it('crossfades video in on onLoadedData', () => {
    const item = makeMediaItem({ media_type: 'video' })
    const { container } = render(<LightboxMedia item={item} />)
    const video = container.querySelector(
      'video[data-testid="lightbox-full-video"]',
    )
    expect(video?.style.opacity).toBe('0')
    fireEvent.loadedData(video!)
    expect(video?.style.opacity).toBe('1')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && bun run vitest run src/components/__tests__/LightboxMedia.test.tsx`
Expected: FAIL — `lightbox-full-video` not found

- [ ] **Step 3: Add video element with onLoadedData**

Add to `LightboxMedia.tsx`, replacing the `!isVideo` conditional with video support:

```tsx
{/* Full-resolution layer */}
{isVideo ? (
  <video
    data-testid="lightbox-full-video"
    src={downloadUrl}
    controls
    autoPlay
    onLoadedData={handleFullLoad}
    className={`max-h-[85vh] max-w-[90vw] rounded object-contain ${
      thumbLoaded ? 'absolute inset-0 m-auto' : ''
    }`}
    style={{
      opacity: fullLoaded ? 1 : 0,
      transition: 'opacity 300ms ease-out',
    }}
  />
) : (
  <img
    data-testid="lightbox-full"
    src={downloadUrl}
    alt={item.caption || ''}
    onLoad={handleFullLoad}
    className={`max-h-[85vh] max-w-[90vw] rounded object-contain ${
      thumbLoaded ? 'absolute inset-0 m-auto' : ''
    }`}
    style={{
      opacity: fullLoaded ? 1 : 0,
      transition: 'opacity 300ms ease-out',
    }}
  />
)}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && bun run vitest run src/components/__tests__/LightboxMedia.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/LightboxMedia.tsx frontend/src/components/__tests__/LightboxMedia.test.tsx
git commit -m "feat: add video support with onLoadedData crossfade"
```

---

### Task 5: Add Error State with Retry

**Files:**
- Modify: `frontend/src/components/__tests__/LightboxMedia.test.tsx`
- Modify: `frontend/src/components/LightboxMedia.tsx`

- [ ] **Step 1: Write failing tests for error state**

```tsx
describe('error state', () => {
  it('shows error pill when full-res image fails to load', () => {
    const item = makeMediaItem({ thumbnail_path: '/thumbs/1.jpg' })
    const { container } = render(<LightboxMedia item={item} />)
    // Load thumbnail
    const thumbImg = container.querySelector(
      'img[data-testid="lightbox-thumbnail"]',
    )
    fireEvent.load(thumbImg!)
    // Error on full-res
    const fullImg = container.querySelector(
      'img[data-testid="lightbox-full"]',
    )
    fireEvent.error(fullImg!)
    expect(screen.getByText('Failed to load')).toBeTruthy()
  })

  it('retries download when error pill clicked', () => {
    const item = makeMediaItem({ thumbnail_path: '/thumbs/1.jpg' })
    const { container } = render(<LightboxMedia item={item} />)
    const thumbImg = container.querySelector(
      'img[data-testid="lightbox-thumbnail"]',
    )
    fireEvent.load(thumbImg!)
    const fullImg = container.querySelector(
      'img[data-testid="lightbox-full"]',
    )
    fireEvent.error(fullImg!)
    const retryBtn = screen.getByText('Failed to load')
    fireEvent.click(retryBtn.closest('button')!)
    // After retry, error state should clear
    expect(screen.queryByText('Failed to load')).toBeFalsy()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && bun run vitest run src/components/__tests__/LightboxMedia.test.tsx`
Expected: FAIL — "Failed to load" not found

- [ ] **Step 3: Add error state and retry logic**

Add to `LightboxMedia.tsx`:

```tsx
const [error, setError] = useState(false)
const [retryKey, setRetryKey] = useState(0)

const handleFullError = useCallback(() => setError(true), [])
const handleRetry = useCallback(() => {
  setError(false)
  setFullLoaded(false)
  setRetryKey((k) => k + 1)
}, [])

// Add onError={handleFullError} to both the <img> and <video> full-res elements
// Add key={retryKey} to force remount on retry

// Replace the loading indicator section with:
const showIndicator = thumbLoaded && !fullLoaded && !error
const showError = error && !fullLoaded
```

Update the indicator JSX to include error state:

```tsx
{/* Loading indicator pill */}
{showIndicator && (
  <div
    data-testid="lightbox-loading-indicator"
    className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-white/[0.08] px-3 py-1.5"
    style={{
      background: 'rgba(0, 0, 0, 0.6)',
      backdropFilter: 'blur(8px)',
    }}
  >
    <div className="h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-white/15 border-t-white/60" />
    <span className="text-[11px] text-white/50">
      Loading full resolution
    </span>
  </div>
)}

{/* Error pill */}
{showError && (
  <button
    data-testid="lightbox-error-indicator"
    onClick={handleRetry}
    className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-white/[0.08] px-3 py-1.5 transition-colors hover:border-white/20"
    style={{
      background: 'rgba(0, 0, 0, 0.6)',
      backdropFilter: 'blur(8px)',
    }}
  >
    <svg className="h-3.5 w-3.5 text-white/50" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M2 8a6 6 0 0 1 10.2-4.3M14 8a6 6 0 0 1-10.2 4.3" />
      <path d="M12 2v3h-3M4 14v-3h3" />
    </svg>
    <span className="text-[11px] text-white/50">Failed to load</span>
  </button>
)}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && bun run vitest run src/components/__tests__/LightboxMedia.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/LightboxMedia.tsx frontend/src/components/__tests__/LightboxMedia.test.tsx
git commit -m "feat: add error state with retry to LightboxMedia"
```

---

### Task 6: Reset State on Item Change

**Files:**
- Modify: `frontend/src/components/__tests__/LightboxMedia.test.tsx`
- Modify: `frontend/src/components/LightboxMedia.tsx`

- [ ] **Step 1: Write failing test for state reset on navigation**

```tsx
describe('navigation reset', () => {
  it('resets loading state when item changes', () => {
    const item1 = makeMediaItem({ id: 100, thumbnail_path: '/thumbs/100.jpg' })
    const item2 = makeMediaItem({ id: 200, thumbnail_path: '/thumbs/200.jpg' })
    const { container, rerender } = render(<LightboxMedia item={item1} />)

    // Load thumbnail for item1
    const thumbImg = container.querySelector(
      'img[data-testid="lightbox-thumbnail"]',
    )
    fireEvent.load(thumbImg!)
    // Should show loading indicator
    expect(screen.getByText('Loading full resolution')).toBeTruthy()

    // Navigate to item2
    rerender(<LightboxMedia item={item2} />)
    // Skeleton or new thumbnail should show — loading indicator gone until new thumb loads
    const newThumb = container.querySelector(
      'img[data-testid="lightbox-thumbnail"]',
    )
    expect(newThumb?.getAttribute('src')).toContain('200')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && bun run vitest run src/components/__tests__/LightboxMedia.test.tsx`
Expected: FAIL — old thumbnail src still showing, or loading indicator persists

- [ ] **Step 3: Add useEffect to reset state on item.id change**

Add to `LightboxMedia.tsx`:

```tsx
import { useState, useCallback, useEffect } from 'react'

// Inside the component, before the return:
useEffect(() => {
  setThumbLoaded(false)
  setFullLoaded(false)
  setError(false)
  setRetryKey(0)
}, [item.id])
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && bun run vitest run src/components/__tests__/LightboxMedia.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/LightboxMedia.tsx frontend/src/components/__tests__/LightboxMedia.test.tsx
git commit -m "feat: reset LightboxMedia loading state on item change"
```

---

### Task 7: Integrate LightboxMedia into Lightbox

**Files:**
- Modify: `frontend/src/components/Lightbox.tsx` (lines 142-155)
- Modify: `frontend/src/components/__tests__/Lightbox.test.tsx`

- [ ] **Step 1: Update Lightbox tests for new structure**

The existing tests check for `img[alt="test"]` and `video` elements. Update them to work with the new `LightboxMedia` sub-component:

```tsx
// In Lightbox.test.tsx, update:
it('renders image for photo items', () => {
  const item = makeMediaItem({ media_type: 'photo', id: 1, caption: 'test' })
  render(<Lightbox item={item} {...defaultProps} />)
  // Full-res img now uses data-testid
  const img = screen.getByTestId('lightbox-full')
  expect(img.tagName).toBe('IMG')
  expect(img.getAttribute('src')).toContain('/download')
})

it('renders video for video items', () => {
  const item = makeMediaItem({ media_type: 'video', id: 2 })
  render(<Lightbox item={item} {...defaultProps} />)
  const video = screen.getByTestId('lightbox-full-video')
  expect(video).toBeTruthy()
  expect(video.getAttribute('src')).toContain('/download')
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && bun run vitest run src/components/__tests__/Lightbox.test.tsx`
Expected: FAIL — `lightbox-full` testid not found (old `<img>` still rendered)

- [ ] **Step 3: Replace media rendering in Lightbox.tsx**

In `Lightbox.tsx`, replace lines 142-155 (the `isVideo ? <video> : <img>` block) with:

```tsx
import LightboxMedia from '#/components/LightboxMedia'

// Replace the isVideo ternary with:
<LightboxMedia item={item} />
```

Remove the `downloadUrl` and `isVideo` variables from `Lightbox.tsx` since they move into `LightboxMedia`. Keep `getDownloadUrl` import for the download button.

- [ ] **Step 4: Run all tests**

Run: `cd frontend && bun run vitest run src/components/__tests__/Lightbox.test.tsx src/components/__tests__/LightboxMedia.test.tsx`
Expected: PASS

- [ ] **Step 5: Run lint/format check**

Run: `cd frontend && bun run check`
Expected: Clean or auto-fixed

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/Lightbox.tsx frontend/src/components/__tests__/Lightbox.test.tsx
git commit -m "feat: integrate LightboxMedia into Lightbox component"
```

---

### Task 8: Final Verification

- [ ] **Step 1: Run full test suite**

Run: `cd frontend && bun run test`
Expected: All tests pass

- [ ] **Step 2: Run type check**

Run: `cd frontend && bunx tsgo --noEmit`
Expected: No type errors

- [ ] **Step 3: Run lint/format**

Run: `cd frontend && bun run check`
Expected: Clean

- [ ] **Step 4: Manual smoke test checklist**

If the dev server is running (`cd frontend && bun run dev`):
1. Open lightbox on an already-prefetched image → should show full-res instantly, no skeleton flash
2. Open lightbox on a non-prefetched image → should show thumbnail with loading pill, then crossfade
3. Navigate prev/next rapidly → loading states reset per item, no stale state
4. Open lightbox on a video → thumbnail shows, video crossfades in when buffered
5. Disconnect network, open lightbox → error pill should appear with retry option
