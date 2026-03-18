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

## Design Context

See `.impeccable.md` for the full design context. Key principles:

1. **Quiet confidence** — Understated, no gratuitous decoration. Let the media be the star.
2. **Purposeful density** — Information-rich but intentional. Tight spacing with clear hierarchy.
3. **Smooth and responsive** — Apple-style easing, instant feedback, no jank.
4. **Keyboard-first, touch-aware** — Power user keyboard shortcuts, equally considered touch.
5. **Consistency over novelty** — Same patterns, spacing, radii, animation curves throughout.

**Personality**: Minimal, calm, refined. **Reference**: Apple Photos. **Theme**: Dark-first.
**Font**: Manrope. **Accent**: Sky blue (#0284c7).
