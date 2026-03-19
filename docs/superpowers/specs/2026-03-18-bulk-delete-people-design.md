# Bulk Delete People from People Grid

Multi-select people in the people grid and delete them in bulk. Generalizes the existing merge-only selection bar into a general-purpose action bar.

## Backend

### `POST /faces/persons/delete-batch`

Request body: `{ person_ids: int[] }`

Steps:
1. Validate all person_ids exist; 404 if any missing
2. Loop: call existing `delete_person(db, person_id)` for each, collecting crop paths
3. After all DB deletes commit, clean up crop files
4. Return `{ success: true, deleted_count: int }`

No new database function needed — reuses `delete_person()`.

## Frontend

### API Client

Add `deletePersonsBatch(personIds: number[])` in `client.ts`. POST to `/faces/persons/delete-batch` with `{ person_ids }`.

### PersonMergeBar → PersonActionBar

Rename `PersonMergeBar` to `PersonActionBar`. When people are selected, show:

- Selection count label (existing)
- **Delete** button — danger styled, triggers confirmation dialog
- **Merge** button — existing behavior, opens KeepPersonPicker

Confirmation dialog for delete: "Delete {n} people? This removes all face data for these people. Photos will remain in your gallery." with Cancel and Delete buttons.

### Route Wiring (index.tsx)

- Wire `onDelete` in PersonActionBar to call `deletePersonsBatch`, then `exitSelectMode()`, `persons.invalidate()`, and toast success
- Merge flow unchanged

### What stays the same

- All selection mechanics (cmd+click, drag select, select group, useSelectMode, useDragSelect)
- usePersonMerge hook's selectMode state — reused for delete action too
- Single person delete in PersonDetail
- KeepPersonPicker merge flow

## Test Updates

- PersonMergeBar tests → rename to PersonActionBar, add delete button tests
- client.ts tests → add deletePersonsBatch
- backend route tests → add delete-batch endpoint tests
- Route integration test → wire-up of delete action
