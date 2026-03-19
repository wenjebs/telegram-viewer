# Person View Delete Actions

Delete photos and persons from the PersonDetail view (`?mode=people&person={id}`).

## Requirements

1. **Hide individual photos** — from person media grid, hides entirely (not just unlinks face)
2. **Delete person** — removes person cluster + all face data, photos stay in gallery
3. **Selection** — multi-select (cmd+click, long-press) + context menu for single photos
4. **Cross-person warning** — warn before hiding photos that appear in other persons' views

## Backend

### `DELETE /faces/persons/{person_id}`

Delete a person and all associated face data. Photos remain in the gallery.

**Steps (in a single transaction):**
1. Collect `crop_path` values from `faces` rows where `person_id = {person_id}`
2. Collect affected `media_id` values from those face rows
3. Delete all `faces` rows where `person_id = {person_id}`
4. Recount `media_items.face_count` for affected media: `UPDATE media_items SET face_count = (SELECT COUNT(*) FROM faces WHERE media_id = media_items.id) WHERE id IN (...)`
5. Delete the `persons` row
6. Commit transaction
7. Delete crop files from collected paths (after commit, following existing pattern in `clear_chat_media`)
8. Return `{ success: true }`

**Error cases:**
- 404 if person does not exist

### `POST /faces/persons/conflicts`

Batch check for cross-person conflicts before hiding photos. Placed under the faces router since it queries faces/persons tables.

**Request body:**
```json
{
  "media_ids": [1, 2, 3],
  "exclude_person_id": 280
}
```

**Response:**
```json
{
  "conflicts": [
    {
      "media_id": 2,
      "persons": [
        { "id": 42, "display_name": "Alice" },
        { "id": 99, "display_name": "Person 99" }
      ]
    }
  ]
}
```

Only returns entries where other persons (besides `exclude_person_id`) have faces in the photo. Empty array if no conflicts. Includes all linked persons regardless of whether their other photos are hidden — the warning is about face data linkage, not visibility.

**Query:**
```sql
SELECT f.media_id, p.id, p.name,
       COALESCE(p.name, 'Person ' || p.id) as display_name
FROM faces f
JOIN persons p ON f.person_id = p.id
WHERE f.media_id IN (...)
  AND f.person_id != :exclude_person_id
```

## Frontend

### PersonDetail header — Delete Person button

- Add "Delete" button next to existing "Merge..." button
- Styled like "Merge..." but with `text-danger` on hover
- Click opens confirmation dialog:
  > "Delete {display_name}? This removes all face data for this person. Photos will remain in your gallery."
- On confirm: `DELETE /faces/persons/{person_id}`
- On success: navigate back to people grid (`mode=people`, clear `person` param), invalidate persons query, toast "Deleted {display_name}"

### Person media grid — Selection mode

Reuse existing `useSelectMode()` hook for the person media grid.

**Enter select mode:**
- Cmd+click (desktop) on a photo
- Long-press (mobile) on a photo

**While in select mode:**
- Click toggles selection
- Shift+click selects range
- Cmd+click toggles single

**SelectionBar:** Reuse existing `SelectionBar` component with `viewMode='people'`. Modify `SelectionBar` to handle people mode:
- Suppress the Favorite button (not relevant in person view)
- Accept an `onBeforeHide` callback that intercepts the hide action — this is where the cross-person conflict check runs. If `onBeforeHide` returns `true`, proceed with hide. If `false`, the hide is cancelled (conflict modal handles it).
- Actions shown: Select All / Deselect, Hide (`H`), Download, Cancel

### Context menu — Right-click single photo

New `PhotoContextMenu` component shown on right-click in person media grid.

**Behavior:**
- Positioned at cursor, clamped to viewport edges
- Shows "Hide photo" action (triggers cross-person warning flow for that single photo)
- Not shown during select mode (select mode has its own UI)
- Dismissed on click outside, Escape, or scroll
- z-index above SelectionBar (z-50)

### Cross-person warning modal

New `CrossPersonWarningModal` component. Triggered before hiding (single or batch) when conflicts exist.

**Flow:**
1. User clicks Hide (or context menu "Hide photo")
2. Call `POST /faces/persons/conflicts` with selected media IDs + current person ID
3. If `conflicts` is empty → hide immediately via `hideMediaBatch`
4. If conflicts exist → show confirmation modal:
   > "These photos also appear in other people's views:
   > - Alice (3 photos)
   > - Person 99 (1 photo)
   >
   > Hiding will remove them from those views too."
   >
   > [Cancel] [Hide anyway]
5. On confirm → `hideMediaBatch`

### Post-hide invalidation

After hiding photos from person view:
- Invalidate person media query (hidden photos filtered out by `hidden_at IS NULL` in `get_person_media_page`)
- Invalidate persons query (note: `persons.face_count` does NOT change — it counts face rows which are untouched by hiding. But the visible photo count in the person grid decreases.)
- Toast: "{n} photos hidden"

### Edge case: all photos hidden

If all photos for a person are hidden, the person media grid shows an empty state. The person still appears in the people grid (face data intact). User can delete the person if they no longer want it, or unhide photos from the existing hidden view.

## Files to modify

**Backend:**
- `backend/routes/faces.py` — new `DELETE /faces/persons/{id}` endpoint + `POST /faces/persons/conflicts` endpoint
- `backend/database.py` — new `delete_person()` and `get_cross_person_conflicts()` functions

**Frontend:**
- `frontend/src/components/PersonDetail.tsx` — add Delete button + confirmation dialog
- `frontend/src/components/SelectionBar.tsx` — add people mode branch (suppress Favorite, add `onBeforeHide` interception)
- `frontend/src/components/PhotoContextMenu.tsx` — new context menu component
- `frontend/src/components/CrossPersonWarningModal.tsx` — new conflict confirmation modal
- `frontend/src/routes/index.tsx` — wire up selection mode for person media grid, integrate context menu + warning flow
- `frontend/src/api/client.ts` — add `deletePerson()` and `getCrossPersonConflicts()` API functions
- `frontend/src/api/schemas.ts` — add response schema for conflicts endpoint

## Out of scope

- Unhide from person view (use existing hidden view for that)
- Bulk delete persons from the people grid
- Undo/restore deleted persons
