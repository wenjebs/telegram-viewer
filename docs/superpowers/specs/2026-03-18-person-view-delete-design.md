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

**Steps:**
1. Delete all face crop files for the person (`cache/faces/{face_id}.jpg`)
2. Delete all `faces` rows where `person_id = {person_id}`
3. Reset `media_items.face_count` for affected media (recount from remaining faces)
4. Delete the `persons` row
5. Return `{ success: true }`

**Error cases:**
- 404 if person does not exist

### `POST /media/other-persons`

Batch check for cross-person conflicts before hiding photos.

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

Only returns entries where other persons (besides `exclude_person_id`) have faces in the photo. Empty array if no conflicts.

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

**SelectionBar:** Reuse existing `SelectionBar` component with `viewMode='people'`. Actions shown:
- Select All / Deselect
- Hide (keyboard shortcut `H`)
- Download
- Cancel (exit select mode)

### Context menu — Right-click single photo

Right-click on a photo in person view shows a minimal context menu:
- "Hide photo" — hides the single photo (with cross-person warning if applicable)

Implementation: simple `onContextMenu` handler that shows a positioned dropdown. Dismiss on click outside or Escape.

### Cross-person warning modal

Triggered before hiding (single or batch) when conflicts exist.

**Flow:**
1. User clicks Hide (or context menu "Hide photo")
2. Call `POST /media/other-persons` with selected media IDs + current person ID
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
- Invalidate person media query (photos disappear from grid)
- Invalidate persons query (face counts may change — hidden photos' faces still exist but media is hidden)
- Toast: "{n} photos hidden"

## Files to modify

**Backend:**
- `backend/routes/faces.py` — new `DELETE /faces/persons/{id}` endpoint
- `backend/routes/media.py` — new `POST /media/other-persons` endpoint
- `backend/database.py` — new `delete_person()` and `get_other_persons_for_media()` functions

**Frontend:**
- `frontend/src/components/PersonDetail.tsx` — add Delete button + confirmation dialog
- `frontend/src/routes/index.tsx` — wire up selection mode for person media grid, add context menu
- `frontend/src/api/client.ts` — add `deletePerson()` and `getOtherPersonsForMedia()` API functions
- `frontend/src/api/schemas.ts` — add response schema for other-persons endpoint
- `frontend/src/components/SelectionBar.tsx` — no changes needed (already supports `viewMode='people'`)
- `frontend/src/components/CrossPersonWarningModal.tsx` — new component for the conflict confirmation

## Out of scope

- Unhide from person view (use existing hidden view for that)
- Bulk delete persons from the people grid
- Undo/restore deleted persons
