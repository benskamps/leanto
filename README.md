# leanto

A tactile popsicle-stick physics sandbox. Real stick dimensions, real gravity, on a
plain tabletop — grab sticks, raise/rotate them, drop them, stack and topple. The
soul is **imperfection**: every stick is slightly different and physics (not a grid)
decides where things land.

> Working name. Ties to the de-risking test: *can you nudge three sticks into a
> lean-to and have it feel satisfying?*

## Run it

ES modules + WASM need to be served over HTTP (double-clicking `index.html` won't work).

```bash
cd ~/projects/leanto
python -m http.server 8123
# then open http://localhost:8123/
```

…or double-click **`serve.bat`** on Windows (starts the server and opens the browser).

## Controls

You start in **BUILD** mode (sticks freeze where you place them). Build a structure,
then press **B** to drop into live physics (**RUN**) and watch it stand or fall.

| Input | Action |
|---|---|
| **Click a stick** | select it and reveal its direct controls |
| **Drag the stick** | pick up & move — it rests on whatever is under the cursor |
| **Drag either amber end** | aim / tilt while the opposite end stays pinned |
| **Drag ↑ above the stick** | lift / lower the stick or glued assembly; scroll while holding remains a shortcut |
| **Drag the ring** | roll around the stick's long axis |
| **Release** | it freezes in place (BUILD) so you can prop the next stick; drops gently (RUN) |
| **BUILD / RUN** or **B** | toggle **BUILD ⇄ RUN** (RUN eases gravity in over ~1s — no slam) |
| **Drag empty** | orbit camera · **Shift/middle-drag empty** | pan · **Scroll** | zoom toward the cursor |
| **1 – 4** | camera angles — ¾ · front · side · top (eased glide, fit to your build) |
| **F** | frame the build — recentre + refit from your current angle |
| **+ Stick** or **Space** | spawn a new stick at the last work-surface pointer |
| **C, arrows, PageUp/Down, [ / ]** | select, move, lift, and roll from the keyboard; hold **R** with arrows to aim |
| **Escape / Ctrl+Z / Ctrl+Y** | cancel the active gesture exactly / undo / redo the last BUILD action |
| **Delete** | remove the selected stick (its glue bonds pop; undo brings it all back) |
| **Backspace** | sweep the table clean · **M** | mute / unmute the clatter |

## Design decisions (locked this session)

- **Hold model, not snapping.** Sticks are placed by hand; physics decides the
  resting pose. Snapping was rejected because it destroys the handmade imperfection
  that *is* the product. (Gentle tip-magnetism is allowed later; grid/angle snapping is not.)
- **Gravity = the grip metaphor**, not a cursor attractor. You hold the stick; you
  don't lure it.
- **BUILD ⇄ RUN with freeze-on-place.** Default is BUILD: a placed stick becomes a
  static (`Fixed`) body — holds its pose *and stays collidable*, so it's your "third
  hand" while you prop the next stick. Press **B** for RUN: every stick flips to
  dynamic with gravity eased in over ~1s (zero-velocity flip, no launch-pop), and the
  structure stands or falls. (Besiege / Poly Bridge pattern.)
- **Surface-inference placement.** A moved stick rests on whatever is under the
  pointer. The lift handle temporarily raises it above that solved pose and shows a
  translucent rest ghost, so height never becomes guesswork.
- **The object carries its controls.** Selecting a stick reveals constant-screen-size
  endpoint, lift, and roll handles. Orientation is still fully free—there is no grid or
  angle snap—but the player manipulates something visible instead of memorizing an
  invisible three-axis mouse mode. Right-drag rotation remains only as a temporary
  compatibility binding.
- **Stack:** Three.js + Rapier (compat/WASM), zero build step.
- **Glue is phase 2.** When built: wet glue = temporary fixed-joint (repositionable);
  **dry glue = merge the two sticks into one compound rigid body** (this is what keeps
  welded structures from jittering apart).

## What this prototype is testing

Only one question: **is grabbing/placing sticks in 3D with a mouse actually fun, or a
fight with the controls?** Everything else (pretty wood, sound, glue, infinite supply)
is downstream of that answer. If the lean-to is satisfying, the toy has legs.
