# Lightbox Loading States

## Problem

The lightbox currently renders raw `<img>` or `<video>` tags with no loading feedback. When the full-resolution media isn't prefetched yet, the user sees an empty dark backdrop until the download completes. There's no indication that anything is happening.

## Design

### Three Visual States

The lightbox media area has three states, displayed progressively based on what's available:

1. **Skeleton** — animated shimmer rectangle. Uses the item's `width`/`height` from `MediaItem` metadata (scaled to fit the lightbox viewport constraints: `max-h-[85vh] max-w-[90vw]`). Falls back to 4:3 aspect ratio when dimensions are null.

2. **Thumbnail** — the cached thumbnail shown clear and fitted (`object-contain`), same sizing constraints as the full image. A small glass pill indicator sits at bottom-center: a spinner + "Loading full resolution" text. The pill has a dark translucent background with backdrop blur and rounded corners.

3. **Full resolution** — the final image or video. Crossfades in over ~300ms (`transition: opacity 300ms ease-out`), replacing the thumbnail. The loading indicator fades out simultaneously.

### State Transitions

```
Skeleton ──→ Thumbnail ──→ Full Resolution
   │              │              ▲
   │              └──────────────┘  (crossfade 300ms)
   │
   └─────────────────────────────┘  (skip if thumbnail cached)
```

States are skipped when data is already available:
- If `usePrefetch` already cached the full image → straight to full resolution (no loading UI visible)
- If thumbnail is cached but full image isn't → skip skeleton, show thumbnail + indicator
- If nothing is cached → skeleton first, then thumbnail when it loads, then full-res

### Implementation Approach: Image onLoad Detection

Stack two `<img>` elements in the same container:
- **Bottom layer:** thumbnail image (`getThumbnailUrl`), always visible until full-res loads
- **Top layer:** full-res image (`getDownloadUrl`), starts with `opacity: 0`

When the full-res image fires `onLoad`, set its opacity to 1 (CSS transition handles the crossfade). The thumbnail remains underneath and is visually replaced.

If neither image has loaded yet, show the skeleton shimmer instead.

React state per lightbox item:
- `thumbnailLoaded: boolean` — set true on thumbnail `onLoad`
- `fullLoaded: boolean` — set true on full image `onLoad`

### Video Handling

Same pattern as images:
- Show thumbnail while video loads
- Use `onLoadedData` event on `<video>` instead of `onLoad`
- Crossfade from thumbnail to video player when ready
- Loading indicator pill shown during buffering

### Error Handling

If the full-res download fails:
- Stay on the current state (thumbnail or skeleton)
- The loading indicator pill changes to an error state: retry icon + "Failed to load"
- Clicking the pill retries the download (re-set the `src` attribute)
- No modal or toast — error is contained within the lightbox

### Loading Indicator Pill

Positioned at bottom-center of the media area. Styling:
- Background: `rgba(0, 0, 0, 0.6)` with `backdrop-filter: blur(8px)`
- Border: `1px solid rgba(255, 255, 255, 0.08)`
- Border radius: `20px`
- Padding: `5px 12px`
- Text: `11px` Manrope, `rgba(255, 255, 255, 0.5)`
- Spinner: `14px` circle, `1.5px` border, `0.8s` linear rotation

### Navigation

Navigation (prev/next) is never blocked by loading state. When the user navigates:
- The new item starts in whatever state its data allows (skeleton, thumbnail, or full-res)
- The previous item's loading continues in the background (browser handles this via the `<img>` src)
- Each item tracks its own `thumbnailLoaded`/`fullLoaded` state independently

### Skeleton Dimensions

When showing the skeleton (no thumbnail available):
- If `MediaItem.width` and `MediaItem.height` are non-null: compute aspect ratio, scale to fit within `max-h-[85vh] max-w-[90vw]`
- If dimensions are null: use 4:3 default aspect ratio
- Shimmer animation: horizontal gradient sweep, `1.5s ease-in-out infinite`

## Files Modified

- `frontend/src/components/Lightbox.tsx` — add loading state logic, stacked image layers, indicator pill, skeleton
- Possibly extract a `LightboxMedia` sub-component for the media area to keep `Lightbox.tsx` focused

## Files Not Modified

- No backend changes — uses existing `/api/media/{id}/thumbnail` and `/api/media/{id}/download` endpoints
- No schema changes — uses existing `width`, `height`, `thumbnail_path` fields from `MediaItem`
- No changes to `usePrefetch.ts` — existing prefetch behavior is complementary
