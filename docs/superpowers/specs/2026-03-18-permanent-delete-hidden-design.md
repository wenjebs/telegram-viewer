# Permanent Delete from Hidden View — Design Spec

## Overview

Add permanent deletion capability to the hidden view. Currently, hiding media is a soft-delete — items move to the hidden view but remain in the database. This feature adds true permanent deletion: database rows removed, cached files wiped, face data cleaned up.

Permanent delete is scoped to the hidden view only (trash → empty trash pattern).

## Backend

### Database Function: `delete_media_items_permanently`

Location: `backend/database.py`

```python
async def delete_media_items_permanently(
    db: aiosqlite.Connection, media_ids: list[int]
) -> list[str]:
```

**Behavior:**
1. Collect `thumbnail_path` and `download_path` from `media_items` rows for the given IDs
2. Collect `crop_path` from any `faces` rows linked to these media items
3. Collect affected `person_id`s from those faces
4. Delete `faces` rows where `media_id IN (...)`
5. Recount `face_count` on affected persons; delete any person that drops to 0 faces
6. Delete `media_items` rows where `id IN (...)`
7. Commit
8. Return all collected file paths (thumbnails, downloads, crops) for disk cleanup

**Key details:**
- Photos are gone from the database entirely — no ghost rows
- Persons with no remaining faces are auto-deleted (cleanup, not a feature the user sees)
- For surviving persons whose `representative_face_id` pointed to a deleted face: reassign to another face in the same person (e.g., `MIN(id)` of remaining faces)
- No need to recount `face_count` on `media_items` since those rows are about to be deleted anyway
- File paths are collected before deletion so the caller can clean up after commit
- Returns the count of rows actually deleted (not the count of IDs requested — silently ignores IDs that don't exist)
- Follows established pattern from `delete_person` and `clear_chat_media`

### API Endpoints

Location: `backend/routes/media.py`

**`DELETE /media/delete-batch`**
- Request body: `{"media_ids": [1, 2, 3]}` (reuses `BatchIdsRequest` model with non-empty validation)
- **Safety guard:** The endpoint filters the requested IDs to only those with `hidden_at IS NOT NULL` before passing to `delete_media_items_permanently`. This enforces the "hidden view only" scope at the backend level — non-hidden items cannot be permanently deleted via this endpoint.
- Calls `delete_media_items_permanently`, cleans up files on disk
- Response: `{"deleted": <count>}` (count of rows actually deleted)
- File cleanup: iterate returned paths, `Path(path).unlink(missing_ok=True)` with OSError logging (same pattern as `delete_person_endpoint`)

**`DELETE /media/hidden`**
- No request body
- Fetches all hidden media IDs via `get_hidden_media_ids`, then calls `delete_media_items_permanently`
- Response: `{"deleted": <count>}`
- Same file cleanup pattern
- Note: the count shown in the confirmation dialog is advisory. If items are unhidden between dialog display and confirmation, the endpoint deletes whatever is currently hidden — this is acceptable behavior.

Both endpoints: DB transaction first, file cleanup after commit.

## Frontend

### API Client

Location: `frontend/src/api/client.ts`, `frontend/src/api/schemas.ts`

New Zod schema:
```typescript
export const DeleteResponse = z.object({ deleted: z.number() })
```

New functions:
```typescript
export const deleteMediaBatch = (mediaIds: number[]) =>
  fetchJSON('/media/delete-batch', DeleteResponse, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ media_ids: mediaIds }),
  })

export const deleteAllHidden = () =>
  fetchJSON('/media/hidden', DeleteResponse, { method: 'DELETE' })
```

### SelectionBar Changes

Location: `frontend/src/components/SelectionBar.tsx`

In hidden mode, currently shows only "Unhide". Change to show both:
- **Unhide** (green, existing behavior)
- **Delete** (danger/red) — new button

New prop: `onDelete?: () => void`

When `viewMode === 'hidden'` and `onDelete` is provided, render the Delete button alongside Unhide.

Keyboard shortcut: `Backspace` or `Delete` key triggers the delete action when in hidden mode select (follows keyboard-first design principle).

### ViewModeHeader Changes

Location: `frontend/src/components/ViewModeHeader.tsx`

When `mode === 'hidden'`, add a "Delete All" button in the header row (next to the close button). Styled as danger (red text).

New props: `onDeleteAll?: () => void`, `hiddenCount?: number`

The "Delete All" button is disabled when `hiddenCount === 0`.

### Confirmation Dialogs

Two confirmation flows, both rendered in `frontend/src/routes/index.tsx`:

**Per-selection delete:**
> "Permanently delete N photos? This cannot be undone."
> [Cancel] [Delete forever]

Triggered by: SelectionBar "Delete" button click. On confirm: calls `deleteMediaBatch` with selected IDs, exits select mode, invalidates hidden media + counts, shows success toast.

**Delete all hidden:**
> "Permanently delete all N hidden items? This cannot be undone."
> [Cancel] [Delete all]

Triggered by: ViewModeHeader "Delete All" button click. Uses `data.hiddenCount` for the number. On confirm: calls `deleteAllHidden`, invalidates hidden media + counts, shows success toast.

Both dialogs are inline JSX in `index.tsx` (fixed overlay, centered card) — same pattern as the PersonDetail delete confirmation. Not a reusable component; the codebase uses inline dialogs for one-off confirmations and `window.confirm()` for simpler cases. These warrant custom dialogs because of the destructive + irreversible nature.

### Post-Deletion Invalidation

After any permanent delete:
- Invalidate hidden media query (`['media', 'hidden', ...]`)
- Invalidate hidden count (`['counts', 'hidden']`)
- Invalidate persons query (`['faces', 'persons']`) — in case persons were auto-deleted
- Exit select mode (if active)
- Toast: "Deleted N photos permanently" / "Deleted all hidden items"

## Testing

### Backend
- `test_database.py`: Test `delete_media_items_permanently` — verifies rows removed, face cleanup, person auto-delete, file paths returned
- `test_routes_media.py`: Test both endpoints — success cases, empty batch rejection, 404 handling

### Frontend
- `SelectionBar.test.tsx`: Test Delete button renders in hidden mode, calls onDelete
- `ViewModeHeader.test.tsx`: Test Delete All button renders in hidden mode, calls onDeleteAll
- Integration in route: confirmation dialog flow (show → cancel, show → confirm)
