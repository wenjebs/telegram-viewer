# Lightbox Navigation Past Page Boundaries

## Problem

The lightbox navigates through `activeItems`, which only contains items from pages fetched by the grid's infinite scroll. When a user navigates prev/next in the lightbox past the last loaded page, the "next" button is disabled because `selectedIndex >= activeItems.length - 1`. The grid's `fetchNextPage()` is only triggered by scroll position, so lightbox navigation and pagination are completely decoupled.

## Design

### Lookahead Pagination Trigger

Add an effect in `useHomeData` (or `useLightbox`) that watches the lightbox's `selectedIndex` relative to `activeItems.length`. When the user navigates within 10 items of the boundary and more pages exist, call `fetchNextPage()` on the active source.

**Trigger condition:**
```
activeItems.length - selectedIndex <= 10 && hasMore && selectedIndex >= 0
```

This fires on every navigation step, so as the user moves forward, the next page is fetched well before they reach the end. By the time they arrive at the boundary, the new items are already appended to `activeItems`.

### Keep "Next" Button Enabled

Currently in `routes/index.tsx` line 393:
```tsx
hasNext={data.lightbox.selectedIndex < data.activeItems.length - 1}
```

Change to:
```tsx
hasNext={data.lightbox.selectedIndex < data.activeItems.length - 1 || data.activeHasMore}
```

This keeps the next button enabled when there are more pages to load, even if the user is on the last loaded item. `handleNext` in `useLightbox` already guards against out-of-bounds access (`selectedIndex < activeItems.length - 1`), so pressing next at the true boundary is a no-op until the next page arrives and `activeItems` grows.

### Handle the Edge Case: User at Boundary While Fetching

If the user reaches the very last loaded item and the next page hasn't arrived yet:
- The next button is still enabled (because `hasMore` is true)
- Pressing next does nothing (the guard in `handleNext` prevents out-of-bounds)
- Once the page loads, `activeItems` grows, `handleNext` re-evaluates, and the user can continue

No loading spinner or special UI needed — the LightboxMedia component already shows the current item normally. The brief pause (typically <500ms) before the next page arrives is acceptable.

### `hasPrev` — No Change

Cursor-based pagination loads forward only. There's no scenario where items exist before the first loaded page. `hasPrev` stays as-is.

## Files Modified

- `frontend/src/hooks/useHomeData.ts` — add effect to trigger `fetchNextPage()` when lightbox index is within 10 items of the boundary
- `frontend/src/routes/index.tsx` (line 393) — update `hasNext` to account for `hasMore`

## Files Not Modified

- `frontend/src/hooks/useLightbox.ts` — no changes needed; `handleNext` already guards bounds
- `frontend/src/components/Lightbox.tsx` — no changes
- `frontend/src/components/LightboxMedia.tsx` — no changes
- No backend changes
