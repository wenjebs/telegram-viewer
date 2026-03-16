# Telegram Viewer

## Documentation Layout

| Content | Location |
|---------|----------|
| Architecture (routes, schema, components, hooks) | `docs/*.md` |
| Conventions and rules (how to run, lint, format) | `CLAUDE.md` / `AGENTS.md` |
| User preferences, feedback, project decisions | Memory files |

Use the `sync-docs` skill to keep docs current after implementation work.

## Memory

When CLAUDE.md or AGENTS.md files are added or modified (root, backend/, or frontend/), update the corresponding memory files in `.claude/projects/-Users-wenjie-projects-telegram-viewer/memory/` to stay in sync.
