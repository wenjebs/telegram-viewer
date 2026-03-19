# Bulk Delete People from People Grid

Multi-select people in the people grid and delete them in bulk. Generalizes the existing merge-only selection bar into a general-purpose action bar.

## Backend

### `DELETE /faces/persons/delete-batch`

Request model:
```python
class DeleteBatchRequest(BaseModel):
    person_ids: list[int]
```

Steps:
1. Loop: call existing `delete_person(db, person_id)` for each, collecting crop paths. Skip any person_id that no longer exists (best-effort).
2. After all DB deletes, clean up crop files
3. Return `DeleteResponse` — `{ deleted: int }` (count of actually deleted persons)

No new database function needed — reuses `delete_person()`.

## Frontend

### API Client

Add `deletePersonsBatch(personIds: number[])` in `client.ts`. DELETE to `/faces/persons/delete-batch` with `{ person_ids }`. Parse response with `DeleteResponseSchema`.

### PersonMergeBar → PersonActionBar

Rename `PersonMergeBar` to `PersonActionBar`. Remove unused `persons` prop. When people are selected, show:

- Selection count label (existing)
- **Delete** button — danger styled, enabled when `selectedCount >= 1`, triggers confirmation dialog
- **Merge** button — existing behavior, enabled when `selectedCount >= 2`, opens KeepPersonPicker

Confirmation dialog for delete: "Delete {n} people? This removes all face data for these people. Photos will remain in your gallery." with Cancel and Delete buttons.

### Route Wiring (index.tsx)

- Wire `onDelete` in PersonActionBar to call `deletePersonsBatch`, then `exitSelectMode()`, `persons.invalidate()`, and toast success
- Merge flow unchanged

### What stays the same

- All selection mechanics (cmd+click, drag select, select group, useSelectMode, useDragSelect)
- usePersonMerge hook's selectMode state — reused for delete action too
- Single person delete in PersonDetail
- KeepPersonPicker merge flow

### Out of scope

- Keyboard shortcut (Backspace/Delete) for delete in select mode — can be added later

## Test Updates

- PersonMergeBar tests → rename to PersonActionBar, add delete button tests
- client.ts tests → add deletePersonsBatch
- backend route tests → add delete-batch endpoint tests
- Route integration test → wire-up of delete action
