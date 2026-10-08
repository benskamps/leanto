Original prompt: "The floor is yours." — perform a full assessment and level-up of this mature project with real users.

## Working notes

- 2026-07-11: Began repository, product, and gameplay assessment from a clean `main` worktree.
- Project appears to be a dependency-free browser physics/building game with a compact JavaScript codebase.
- Source map complete: `main.js` coordinates input/rendering; Rapier owns physics; save data and glue bonds are versioned; helper modules cover scene, camera, audio, tools, charm, and local metrics.
- ROADMAP.md is behind the source: pre-grab hover/aim feedback, local telemetry, a feel-rating prompt, and a seeded lean-to test scene are already implemented.

## Audit result

- Desktop and 390×844 journeys inspected in headed Chromium.
- Cottage baseline: 134 sticks / 247 bonds, RUN p95 18.3 ms on this workstation.
- 300 loose-stick RUN baseline: p95 25.5 ms, above the roadmap's 20 ms gate.
- Primary product debt is the invisible/memorized control model and the instruction-wall HUD,
  followed by touch/accessibility gaps and idle/per-stick rendering cost.
- `ROADMAP.md` rewritten as the post-#15 control-first 100× plan, including a command/state
  schema, direct-manipulation map, workbench wireframe, performance budgets, and #16–#23 gates.

## Next execution move

- Sprint #16: check in reproducible interaction/performance baselines and observe five
  uncoached current-control sessions.
- Sprint #17: prototype endpoint/lift handles and the interaction controller before visual polish.

## Implementation brief — 2026-07-13

- Visual thesis: a quiet craft table whose controls feel like physical workshop tools—warm paper,
  dark ink, and one amber accent, with the sticks remaining the dominant visual.
- Content plan: minimal brand/status, persistent BUILD/RUN control, contextual one-line hint,
  bottom tool rail, and an optional help sheet; no permanent instruction wall.
- Interaction thesis: selecting a stick reveals screen-sized endpoint and lift handles; direct
  drags produce a pinned pivot/height response; mode/tool changes use short restrained transitions.
- First implementation slice: the explicit controller state, command registry, exact gesture
  capture/cancel, direct handles, workbench shell, responsive desktop-only guard, and test hooks.

## Implemented — control/workbench slice

- Added `src/interaction.js`: explicit world/tool/selection/gesture/target/device state plus the
  single command registry used to generate help.
- Added `src/handles.js`: constant-screen-size endpoint, lift, and roll handles for direct stick
  manipulation.
- Added `src/workbench.js` and replaced the instruction-wall HUD with semantic BUILD/RUN,
  Undo/Help, contextual hints, a bottom tool rail, and responsive layout.
- Main input now prioritizes selected handles, captures gestures, and restores the exact BUILD
  pose on Escape or pointer cancellation. Legacy right-drag remains temporarily available.
- Added `window.render_game_to_text` and a regular-time `advanceTime` fallback for the required
  web-game test loop.
- JavaScript syntax checks and `git diff --check` pass. Browser interaction verification next.

## Verified — interaction, access, and performance

- Click-to-select no longer moves a stick or activates OrbitControls; movement begins after 4 px.
- Endpoint aim keeps the opposite endpoint fixed; lift raises the complete glued assembly and shows
  the solved rest ghost; roll changes assembly orientation; the camera remains unchanged.
- Escape during a captured lift restores every assembly member to the exact starting pose without
  adding a placement or undo step. Pointer cancellation uses the same path.
- Glue and Snip toolbar flows, Add Stick, Duplicate, BUILD/RUN disabling, generated Help, photo HUD,
  keyboard select/move/lift/aim/roll, and multi-step undo were exercised in Chromium.
- Responsive 390×844 layout visually passes without overlapping brand, mode, help, daylight, or tools.
- Audio is now mute-first and persistent; reduced-motion disables camera glides and photo autorotation.
- Stable BUILD performs zero continuous physics steps while mutation maintenance steps preserve
  shape-query stacking (`0.0012 m` then `0.0034 m` for two flat sticks).
- Fresh 930×930 Chromium benchmarks: Cottage RUN p95 17.4 ms; 300 BUILD p95 17.2 ms / 0 Hz
  physics; 300 RUN p95 17.3 ms, p99 23 ms, physics 120.3 Hz, zero backlog drops.
- The required web-game client produced final screenshots/state with no console or page errors;
  direct Playwright flows supplied precise handle-drag coverage the burst client cannot express.

## Implemented — command history completion (2026-07-16)

- Undo is now snapshot-based: every mutation site captures a camera-less scene snapshot BEFORE the
  change (grab, keyboard transform, spawn, stamp, snip, glue, unglue, delete) and history restores
  through the same versioned save path a file-load uses. Bonds, tints, and lengths round-trip by
  construction; the camera never moves on undo.
- **Redo** exists: Ctrl/Cmd+Y and Ctrl/Cmd+Shift+Z, plus a workbench ↷ button beside Undo. A fresh
  action forks history (the redo line dies). Both stacks flush at the RUN reveal, both deny in RUN
  and mid-hold, both cap at 100 entries.
- **Delete** exists: select a stick, press Delete — its glue bonds pop with it; one undo step brings
  stick and bonds back. Registry rows added for Redo and Delete, so generated Help stays truthful.
- Test hooks: `api.history()`, `api.undo()`, `api.redo()`, `api.select(id)`, `api.removeSelected()`.
- Verified in headless Chromium against the seeded lean-to: 32/32 scripted checks pass (delete/undo/
  redo round-trips incl. bonds, history fork, keyboard bindings, RUN flush, camera invariance, spawn
  and snip paths) with zero console errors. At 300 sticks: pre-mutation snapshot ~1 ms in the gesture
  path; undo/redo restore ~35–41 ms as a single discrete step on an explicit command.
- Known trade: a restore respawns sticks, so runtime stick ids are reassigned (same semantics as
  loading the Cottage or an autosave) and selection clears on undo.

## Remaining roadmap work

- Observe Sprint #16/#17 with real uncoached players and compare corrections/control rating.
- Add richer invalid-reason/contact previews and occluded-target cycling.
- Profile/render-batch per-stick draw calls if lower-end hardware misses the new budget.
- Complete explicit touch-device emulation and screen-reader audit.
- Implement versioned share links, read-only opening, and Remix (#22).

## Current request — ragdoll and freeform release physics (2026-07-28)

- User asked for a realistic ragdoll plus freeform physics: a released stick should keep
  behaving physically.
- Added a dedicated articulated workshop mannequin with 10 independently simulated bodies,
  5 spherical joints, and 4 limited anatomical hinges. It is placeable from the Doll rail
  button or K, save/load and undo aware, frozen for posing safety in BUILD, and its
  individual parts are grabbable in RUN.
- LIVE/RUN grabs now preserve a recent measured linear and angular hand velocity on release
  (including tangential velocity across multi-body grabs) instead of zeroing momentum.
- Verified with the required web-game client plus direct Playwright flows: BUILD posture;
  RUN collapse and sleep; limb throws with linear + angular momentum; ordinary-stick
  horizontal release velocity followed by gravity; ragdoll undo/redo and serialized pose;
  hidden-handle text-state parity; and a 390×844 rail/layout capture (no overflow).
- Final required-client capture and every direct flow completed with zero console/page errors.

## Visual level-up — window light, cutting mat, a room (2026-10-08)

- The key light is now a far spotlight with a painted cookie: four-plus-two window panes and a
  trailing pothos on the sill, so a pool of dappled late-afternoon light falls across the table.
  In the evening the cookie becomes one round lamp pool and the light moves to a desk lamp.
- The sky is a painted dome (gradient + sun glow, dithered); a prefiltered environment
  (PMREM of a warm room with one bright window) gives wood a sheen and the glass jar reflections.
  Nothing is downloaded: every texture is drawn on a canvas at boot from a seeded PRNG.
- The table is walnut planks with knots and seams; a sage self-healing cutting mat (A3, 1 cm grid,
  45°/60° guides, old knife scores) is painted onto its top. The table has legs, a rug and a
  floor that fades into haze. The floor has a static collider, so a stick knocked off the table
  lands instead of falling forever. No other physics changed.
- Sticks: four birch grain variants with a matching bump map, so a pile never looks stamped.
- Chrome: BUILD ⇄ RUN is a two-position switch with a sliding thumb (rust in RUN) and a B key
  cap; the daylight dial is a vertical sun-to-moon slider; the brand sits on a paper card; the
  resume prompt is a real button; the loader is two sticks leaning; a soft vignette deepens at dusk.
- Opening frame: six sticks laid out like a fresh kit (a fanned bundle and a crossed pair), a
  2.4 s camera drift onto them (skipped under reduced motion), and an invitation hint until the
  first touch. On a tall phone the camera pulls back so both groups fit.
- Fix: Space on a focused button or slider no longer also adds a stick.
- Verified in headless Chromium under the site's enforced CSP (with 'wasm-unsafe-eval'): boot
  shows 6 sticks, zero CSP violations, zero console errors; Space on the Help button opens Help
  with 6 sticks; Space on the canvas still adds one; the cottage loads (134 sticks).
