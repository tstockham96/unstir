# UNSTIR

**A daily picture has been stirred by hidden whirlpools. Press a whirlpool's eye and circle your thumb to stir it back.**

Each whirlpool is a smooth twist (rotation angle `s·(1−d/r)²`), so it is area-preserving and exactly invertible.

**Whirlpools never overlap.** Their full influence disks are kept at least `GAP` = 0.05 board widths apart, so they commute:
you can undo them in any order, and an eye always sits exactly where its swirl is centred.

**A guide pattern makes the eyes findable.** Every puzzle overlays a crisp pattern that gets stirred along with the picture.
It's a fine square grid, diagonal stripes (easy days only) or a dot lattice (Mondays only), drawn as thin semi-transparent palette lines.
The lines started out straight, so wherever they curl there's a whirlpool, and the tightest spiral marks its eye. Nothing marks the centre directly.
Generator guarantees (checked by `problems()` and `tests/solver.test.ts`):
- radius ≥ 0.18 board widths (`MIN_R`, about 63 px on a 390 px phone)
- twist at the eye ≥ 3.2 rad (`MIN_S`, about 183°)
- eyes inside the board
- eyes kept away from round or radial scene features such as suns, ray bursts and ripple rings, so they land on straight edges

How a twist is measured:
- Your thumb's circling angle × 1.6 sets the twist amount.
- How far out you circle sets the whirlpool's size.
- The picture follows your thumb live while you stir.

What you see when you let go:

| | meaning |
|---|---|
| 🌀 | Locked. You cancelled a whirlpool and the picture snaps clean there. |
| 🟧 | Right whirlpool, imprecise. You get a hint (more · less · wider · tighter · eye · other way). |
| ⬜ | No whirlpool eye there. |

Eye tolerance is 0.05 board widths (about 17 px). The guide lines under your thumb light up while you stir. After a 🟧 they flash around where *you* stirred (never around the answer), and after a 🌀 they flash around the area that just snapped clean.

Par = the number of whirlpools. That's provably optimal, since each lock removes exactly one.
Brute force stays in check. Two simulated "players" never look at the picture: a jabber that pokes random spots and then follows the 🟧 hints, and a random tapper.
Even on Mondays they solve under 4% and under 1% of the time respectively (`npm test`, `npm run audit`).
You get par + 6 twists before the picture "sets" and the replay shows the rest.

Difficulty follows the weekday:

| Mon | Tue | Wed | Thu | Fri | Sat | Sun |
|---|---|---|---|---|---|---|
| Ripple, 2 | Eddy, 3 | Current, 3 | Undertow, 4 | Maelstrom, 4 | Vortex, 5 | Storm, 5 |

Harder days have more whirlpools, smaller radii (never below 0.18), a wider range of twist amounts, and eyes allowed nearer the edge.

Puzzle #1 is Fri Oct 2 2026. Puzzles are deterministic per local day.

## Run
```bash
npm install
npm run dev          # http://localhost:5173
npm test             # vitest: geometry, judging, determinism, 60-day solvability, 50-seed every-permutation solver, share/challenge/stats/crowd
npm run typecheck
npm run build        # dist/ (normal, hashed assets) + dist-single/index.html (one file, opens from disk)
VITE_BASE=/unstir/ VITE_PUBLIC_URL=https://example.com/unstir/ npm run build   # sub-path deploy
npm run verify       # Playwright e2e: 390x844 touch play → shots/*.png + shots/play.mp4 (needs /usr/bin/google-chrome + ffmpeg)
npm run audit        # simulated players per day → shots/audit.json
npm run week         # start-state screenshots for a week → shots/v2/v2-mon.png … v2-sun.png, v2-mid-twist.png, v2-solved.png
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
