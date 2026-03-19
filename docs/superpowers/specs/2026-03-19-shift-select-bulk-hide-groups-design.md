# Shift-Click Group Selection & Bulk Hide

**Date**: 2026-03-19
**Status**: Approved

## Problem

The chats panel (Sidebar) only supports single-click group toggling. Users managing many groups need a way to select a range and perform bulk actions (specifically hiding) without clicking each one individually.

## Design

### Backend: Batch Hide Endpoint

Add `POST /groups/hide-batch` mirroring the existing `POST /groups/unhide-batch`:

- **Request body**: `{ dialog_ids: number[] }`
- **DB function**: `hide_dialogs(db, dialog_ids)` — single `UPDATE dialogs SET hidden_at = ? WHERE chat_id IN (...)` query
- **Response**: `{ success: true }`

### Frontend: Shift-Click Range Selection

Reuse the existing `useSelectMode` hook (already battle-tested for media/people) in the Sidebar:

- **Anchor tracking**: Every normal group click (toggle active) sets `lastClickedIdRef` via the hook
- **Shift+click**: Calls `toggleRange(clickedId, visibleGroups)` — selects the range between anchor and clicked group, using the filtered/sorted group list as the ordered items array
- **Visual state**: Selected groups get a distinct highlight (ring or subtle background) separate from the active/inactive blue styling, so both states are visible simultaneously
- **Escape**: Clears the group selection via `deselectAll()`
- **Normal click (no shift)**: Toggles active as usual, updates the anchor, clears any existing selection
- **Scope**: Selection only applies to the visible (non-hidden) group list. Hidden groups in the hidden section are not part of this selection.

### Bulk Actions on Selected Groups

When 1+ groups are selected:

- **`h` hotkey**: Shows a confirmation dialog — "Hide N groups?" with Cancel/Hide buttons. On confirm, calls `hideDialogBatch(selectedIds)`, invalidates queries, clears selection
- **Right-click context menu**: When right-clicking any selected group, shows a context menu with "Hide N groups" option. Same confirmation + batch hide flow as the hotkey
- **Guard**: The `h` hotkey only fires when groups are selected — no conflict with other shortcuts

### Cache Invalidation

After batch hide: invalidate `groups`, `hiddenDialogs`, and `counts.hiddenDialogs` queries.

### Frontend API Client

Add `hideDialogBatch(dialogIds: number[])` in `client.ts`, matching the existing `unhideDialogBatch` pattern.

## Layer Summary

| Layer | Change |
|-------|--------|
| Backend | `POST /groups/hide-batch` endpoint + `hide_dialogs(db, ids)` DB function |
| Frontend API | `hideDialogBatch(dialogIds)` client function |
| Sidebar | Wire `useSelectMode` hook — normal click sets anchor, shift+click selects range, Escape clears |
| Sidebar visuals | Selected groups get a distinct highlight layered on top of active/inactive styling |
| Bulk hide | `h` hotkey + right-click context menu, both gated on selection, both show confirmation dialog |
| Cache invalidation | After batch hide: invalidate `groups`, `hiddenDialogs`, `counts.hiddenDialogs` |

## Out of Scope

- Drag-select for groups
- Ctrl+click individual toggle (just shift-click range for now)
