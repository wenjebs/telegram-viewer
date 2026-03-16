# Project Overview

Local web app that connects to a user's Telegram account, indexes media (photos, videos, documents) from selected groups/channels, and presents them in a browsable gallery.

**Architecture:** FastAPI backend + React 19 SPA frontend, SQLite database, single-user local-only deployment. No Docker or CI/CD. Monorepo with `backend/` and `frontend/` directories.

**Key flows:**
- Auth: phone → verification code → optional 2FA password → session persisted via Telethon session file
- Group selection: list Telegram dialogs (with fuzzy search via Fuse.js), toggle which groups are "active" for indexing. Separate display filter lets you narrow the gallery to specific groups without affecting sync.
- Sync: background task model — fire-and-forget POST starts sync, frontend polls for progress every 2s. Server-side Telethon filters (photos + video), batched DB writes (100 items), FloodWait handling, incremental checkpointing (every 500 items).
- Browse: cursor-paginated media grid with group/type/date-range filters, resizable sidebar, lightbox for full view with keyboard nav (S/H/F shortcuts), streaming download from Telegram with local disk caching. Background prefetch downloads loaded media (3 concurrent, newest-first LIFO queue) so lightbox views are instant.
- Multi-select: click/shift-click/drag-rectangle selection, batch download as ZIP, batch hide/unhide/favorite
- Favorites & hidden: hide/unhide media and groups, favorite media items, dedicated view modes with count badges
