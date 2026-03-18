# Project Overview

Local web app that connects to a user's Telegram account, indexes media (photos, videos, documents) from selected groups/channels, and presents them in a browsable gallery.

**Architecture:** FastAPI backend + React 19 SPA frontend, SQLite database, single-user local-only deployment. Docker Compose with profiles (`prod` / `dev`) for distribution via `https://tele.view`. One-command setup via `./setup.sh` (configures `.env`, `/etc/hosts`, trusts Caddy CA cert, builds containers). Monorepo with `backend/` and `frontend/` directories.

**Key flows:**
- Auth: phone → verification code → optional 2FA password → session persisted via Telethon session file
- Group selection: list Telegram dialogs (with fuzzy search via Fuse.js), toggle which groups are "active" for indexing. Separate display filter lets you narrow the gallery to specific groups without affecting sync. Unsync removes all indexed media and resets sync state for a group.
- Sync: background task model — fire-and-forget POST starts sync, frontend polls for progress every 2s. Server-side Telethon filters (photos + video), batched DB writes (100 items), FloodWait handling, incremental checkpointing (every 500 items).
- Browse: cursor-paginated media grid with group/type/date-range/faces filters, resizable sidebar, lightbox for full view with keyboard nav (S/H/F shortcuts), streaming download from Telegram with local disk caching. Videos stream progressively while caching to disk; non-videos use disconnect-resilient background downloads with deduplication. Background prefetch downloads loaded media (3 concurrent, newest-first LIFO queue) so lightbox views are instant.
- Multi-select: click/shift-click/drag-rectangle selection, batch download as ZIP (async prepare-poll-download flow with per-file progress), batch hide/unhide/favorite
- Favorites & hidden: hide/unhide media and groups, favorite media items, dedicated view modes with count badges
- Face recognition: scan indexed photos for faces (InsightFace detection + DBSCAN clustering), browse detected persons, rename/merge persons, view media filtered by person. Progress-tracked background scan with resume on interruption.
- Settings backup/restore: export all user preferences (hidden/inactive groups, favorites, person names) as JSON, import with additive-only merge and summary feedback.
- URL state: view mode, filters (media type, chat type, sync status, faces, date range, sort order, display groups), lightbox item, selected person, and search query are stored in URL search params for deep-linking, page refresh persistence, and back/forward navigation support.
