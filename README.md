# UNSTIR

**A daily picture has been stirred by hidden whirlpools. Press a whirlpool's eye and circle your thumb to stir it back.**

Each whirlpool is a smooth twist (rotation angle `s·(1−d/r)²`), so it is area-preserving and exactly invertible.
Whirlpools are laid down in order, and the ones on top have to come off first.

How a twist is measured:
- Your thumb's circling angle × 1.6 sets the twist amount.
- How far out you circle sets the whirlpool's size.
- The picture follows your thumb live while you stir.

What you see when you let go:

| | meaning |
|---|---|
| 🌀 | Locked. You cancelled a whirlpool and the picture snaps clean there. |
| 🟧 | Right whirlpool, imprecise. You get a hint (more · less · wider · tighter · eye · other way). |
| 🟨 | That whirlpool is buried under another one. |
| ⬜ | Nothing stirred there. |

Par = the number of whirlpools. That's provably optimal, since each lock removes exactly one.
You get par + 6 twists before the picture "sets" and the replay shows the rest.

Difficulty follows the weekday:

| Mon | Tue | Wed | Thu | Fri | Sat | Sun |
|---|---|---|---|---|---|---|
| Ripple, 2 | Eddy, 3 | Current, 3 | Undertow, 4 | Maelstrom, 4 | Vortex, 5 | Storm, 5 |

Puzzle #1 is Fri Oct 2 2026. Puzzles are deterministic per local day.

## Run
```bash
npm install
npm run dev          # http://localhost:5173
npm test             # vitest: geometry, judging, determinism, 60-day solvability, share/challenge/stats/crowd
npm run typecheck
npm run build        # dist/ (normal, hashed assets) + dist-single/index.html (one file, opens from disk)
VITE_BASE=/unstir/ VITE_PUBLIC_URL=https://example.com/unstir/ npm run build   # sub-path deploy
npm run verify       # Playwright e2e: 390x844 touch play → shots/*.png + shots/play.mp4 (needs /usr/bin/google-chrome + ffmpeg)
npm run audit        # simulated players per day → shots/audit.json
```
URL flags:
- `?reset` wipes local data.
- `?debug&n=7` plays puzzle #7 (dev only).
- `#c=<code>` is a friend challenge.

## Config / monetization stubs
- `VITE_PUBLIC_URL` sets the canonical link used in share text and challenges.
  - The default is the current page.
  - From `file://` it falls back to `https://unstir.app/`, which is a placeholder.
- `VITE_FEATURE_PREMIUM=0` hides UNSTIR+.
  - UNSTIR+ is the archive of past days, behind a paywall card.
  - "Unlock (demo)" only sets a localStorage flag; there are no real payments.
- `VITE_FEATURE_ADS=0` hides the ad slot on the results sheet.
  - It's an empty, labelled 320×100 placeholder with no ad SDK.
- These can also be set at runtime: `window.UNSTIR_CONFIG = { publicUrl, features: { premium, ads } }`.

## Honest notes
- **"Today's players" is a simulated crowd (marked "est.")**: 500 model players per day (`src/core/crowd.ts`). Replace it with real aggregate results once there's a backend.
- **Stats, streaks and challenges** live in localStorage (`unstir:v1`). A challenge link only carries the puzzle number, the sender's emoji row, time and name.
- **Sound** is synthesized with WebAudio. **Haptics** use `navigator.vibrate`, which iOS Safari doesn't support, so iOS gets no haptics.
- **Content:** 14 procedural scenes × 3 palettes. The scene repeats every 14 days, though the whirlpools differ each day.
