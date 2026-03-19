# Remotion Video + README Redesign

## Overview

Add a Remotion project to the repo that produces two video assets — an animated logo GIF and a synthetic UI demo video — then redesign the README to showcase them in a modern open-source style.

## Approach

Single `remotion/` folder at the repo root with two compositions sharing design tokens (Manrope, sky blue #0284c7, dark theme). Assets are rendered locally via `npx remotion render` and committed to `assets/`.

## 1. Logo Animation

**Output:** GIF (~400x200, ~3s, looping) + static PNG fallback

**Storyboard:**

| Time | Frame | Description |
|------|-------|-------------|
| 0.0s | Empty | Dark frame, nothing visible |
| 0.5s | Searching | Viewfinder bracket fades in, gently pulses at 30% white opacity |
| 1.5s | Lock | Bracket contracts sharply, turns sky blue (#0284c7) with glow — the "snap" moment. Center dot appears |
| 2.0s | Reveal | Settles to white — the final logo form. "Telegram Viewer" text fades in below in Manrope 600 |
| 3.0s | Hold | Brief hold, then loops back to start |

**Animation curves:**
- Search pulse: ease-in-out, scale 1.0–1.05
- Snap: spring(1, 200, 20) — sharp contraction with slight overshoot
- Settle: ease-out over 0.3s
- Text fade: opacity 0→1 over 0.4s

**Elements:**
- Rounded-rect viewfinder bracket (matches the existing logo shape)
- Center focus dot (4px circle)
- "Telegram Viewer" in Manrope 600, white

## 2. Demo Video

**Output:** MP4 (1280x720, 30fps, ~15s) + compressed GIF fallback (~800px wide)

**Scenes:**

### Scene 1: Media Grid (0–3s)
A 4-column photo grid scrolls into view. Tiles use gradient placeholders (dark blue tones). Items stagger-animate in as they appear. A fake macOS cursor smoothly scrolls down to reveal more media.

### Scene 2: Photo Lightbox (3–6s)
Cursor clicks a thumbnail. It expands into a full lightbox view with a scale transition. Brief pause, then close animation back to grid.

### Scene 3: Face Detection (6–10s)
Navigate to People view. Sky blue bounding boxes animate onto a photo. Person avatar chips appear in a row. One is clicked — the grid filters to show only that person's photos.

### Scene 4: Search & Filter (10–13s)
Search bar receives focus. Realistic typing animation spells out a query. Filter chips appear (media type, date). Grid updates with matching results sliding in.

### Scene 5: End Card (13–15s)
Fade to centered logo + "Telegram Viewer" + tagline "Self-hosted. Private. Open source." Clean ending that loops well.

**Visual style:**
- Dark theme matching the app (#0a0a0a background)
- Manrope font throughout
- Sky blue (#0284c7) for accents and interactive highlights
- Gradient placeholders for photos (dark blue tones, no real images)
- Crossfade transitions between scenes (0.3s)
- Spring physics for UI interactions

**Fake cursor:**
- macOS-style pointer
- Eased interpolation movement (no teleporting)
- Click indicator: subtle pulse ring at click point

## 3. README Redesign

**Layout (top to bottom):**

1. **Centered animated logo** — the GIF from composition 1, centered, links to the repo
2. **Project name + description** — "Telegram Viewer" as h1, one-line description below
3. **Badges row** — License, Docker Ready, TypeScript, Python (centered)
4. **Demo video** — embedded GIF/MP4 from composition 2, full-width in a rounded container
5. **Feature highlights** — 2x2 grid of feature cards:
   - Media Browser — browse photos, videos & files
   - Face Detection — auto-detect and filter by person
   - Search & Filter — by chat, date, media type
   - Self-Hosted — data stays local, no cloud
6. **Architecture** — visual diagram: Frontend → Backend → Caddy (enhanced from current table)
7. **Quick Start (Docker)** — existing content preserved
8. **Manual Setup** — existing content preserved
9. **Development** — existing content preserved
10. **Troubleshooting** — existing content preserved

**What changes:**
- Added: animated logo, badges, demo video, feature cards, visual architecture
- Kept: all existing documentation sections (setup, dev, troubleshooting)
- The architecture table is replaced with a more visual representation in markdown

## 4. Project Structure

```
remotion/
├── package.json          # Remotion + React dependencies
├── tsconfig.json
├── src/
│   ├── Root.tsx           # Remotion root — registers both compositions
│   ├── LogoAnimation.tsx  # Composition 1: autofocus logo
│   ├── DemoVideo.tsx      # Composition 2: synthetic UI walkthrough
│   ├── DemoVideo/
│   │   ├── MediaGrid.tsx      # Scene 1
│   │   ├── PhotoLightbox.tsx  # Scene 2
│   │   ├── FaceDetection.tsx  # Scene 3
│   │   ├── SearchFilter.tsx   # Scene 4
│   │   └── EndCard.tsx        # Scene 5
│   └── shared/
│       ├── theme.ts       # Colors, fonts, spacing tokens
│       ├── FakeCursor.tsx # Animated cursor component
│       └── Logo.tsx       # Logo SVG component (shared between compositions)
assets/
├── logo-animated.gif      # Rendered output
├── logo-static.png        # Static fallback
├── demo.mp4               # Rendered output
└── demo.gif               # Compressed GIF fallback
```

## 5. Render Commands

```bash
cd remotion
bun install
# Preview in browser
npx remotion studio
# Render logo GIF
npx remotion render LogoAnimation --image-format=png --output=../assets/logo-animated.gif
# Render demo MP4
npx remotion render DemoVideo --output=../assets/demo.mp4
```

## Non-goals

- No CI/CD pipeline for rendering — manual render and commit
- No real screenshots or screen recordings — fully synthetic UI
- No interactive elements in the README — static GIF/MP4 embeds only
- No changes to the app itself — this is purely a README/marketing effort
