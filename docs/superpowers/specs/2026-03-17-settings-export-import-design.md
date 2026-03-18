# Settings Export/Import — Design Spec

## Purpose

Backup and restore user curation work (hidden groups, favorites, person names, etc.) so it survives database resets or fresh installs. Same Telegram account assumed.

## Export Format

```json
{
  "version": 1,
  "exported_at": "2026-03-17T12:00:00Z",
  "hidden_groups": [{ "chat_id": 123, "hidden_at": "2026-03-10T08:00:00Z" }],
  "inactive_groups": [{ "chat_id": 123 }],
  "hidden_media": [{ "message_id": 456, "chat_id": 123, "hidden_at": "2026-03-10T08:00:00Z" }],
  "favorited_media": [{ "message_id": 456, "chat_id": 123, "favorited_at": "2026-03-10T08:00:00Z" }],
  "person_names": [{ "person_id": 1, "name": "Alice" }]
}
```

- `version` field for future schema evolution.
- Timestamps preserved from original records (true backup, not re-stamped on import).
- Arrays are empty `[]` when no data exists for that category.

## Backend API

### `GET /api/settings/export`

Returns the JSON file as a downloadable attachment.

**Response:** `200` with `Content-Disposition: attachment; filename="telegram-viewer-settings-YYYY-MM-DD.json"` and `Content-Type: application/json`.

**Data sources:**
| Field | Query |
|-------|-------|
| `hidden_groups` | `dialogs WHERE hidden_at IS NOT NULL` |
| `inactive_groups` | `sync_state WHERE active = 0` |
| `hidden_media` | `media_items WHERE hidden_at IS NOT NULL` |
| `favorited_media` | `media_items WHERE favorited_at IS NOT NULL` |
| `person_names` | `persons WHERE name IS NOT NULL` |

### `POST /api/settings/import`

Accepts the JSON file. Returns a summary of what was applied.

**Request:** `multipart/form-data` with a single `.json` file field.

**Response:**
```json
{
  "applied": {
    "hidden_groups": 3,
    "inactive_groups": 1,
    "hidden_media": 12,
    "favorited_media": 7,
    "person_names": 2
  },
  "skipped": {
    "unknown_ids": 4,
    "already_set": 8
  }
}
```

**Import behavior — merge only:**
- Hidden groups: set `hidden_at` where currently null; skip if already hidden.
- Inactive groups: set `active = 0` where currently active; skip if already inactive.
- Hidden media: match by `(message_id, chat_id)` — the Telegram-stable unique key. Set `hidden_at` where currently null; skip if already hidden.
- Favorited media: match by `(message_id, chat_id)`. Set `favorited_at` where currently null; skip if already favorited.
- Person names: set `name` where currently null; skip if person already has a name (no overwrites). Note: `person_id` is autoincrement — import is best-effort and only works within the same database instance. After a full reset + re-scan, person IDs will differ and names won't match.
- IDs not found in the database are silently counted in `skipped.unknown_ids`.
- No data is ever removed or overwritten.

**Validation:**
- Reject if `version` field is missing or unsupported.
- Reject if file is not valid JSON.
- Reject if file exceeds 10 MB.
- Validation errors return `422` with `{"detail": "<reason>"}`. File size rejection returns `413`.

## Frontend

### Settings Panel

A full slide-out panel triggered by a **gear icon** (lucide `Settings`) placed in the sidebar footer, replacing the current standalone `ThemeToggle`.

**Panel contents:**

1. **Appearance** section
   - Theme toggle (relocated from sidebar footer)

2. **Backup** section
   - **Export** button — triggers `GET /api/settings/export`, browser downloads the file.
   - **Import** button — opens native file picker (`.json` only), uploads via `POST /api/settings/import`, shows toast with summary (e.g., "Restored 3 hidden groups, 12 favorites, 2 person names").

**Panel behavior:**
- Replaces the sidebar content in-place (same panel area, different content) with a slide transition.
- Has a header with "Settings" title and back/close button to return to the sidebar.
- Closes on Escape key.
- Import button disabled while request is in-flight.
- After successful import, invalidate all TanStack Query caches to refresh UI.

### Toast

Import success shows a brief toast summarizing applied and skipped counts (e.g., "Restored 3 hidden groups, 12 favorites. 4 items skipped."). Import failure (invalid file, wrong version) shows an error toast with the reason.

## Scope Exclusions

- No "replace all" import mode — merge only.
- No selective import (e.g., "only restore favorites") — all categories applied.
- No theme in export — trivial to re-set.
- No sync state (checkpoints, last_msg_id) — this is operational, not curation.
- No face embeddings/detections — instance-specific, too large.
