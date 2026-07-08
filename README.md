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
| **Left-drag a stick** | pick up & move — it rests on whatever's under the cursor (table or another stick) |
| **Right-drag a stick** | rotate it — drag to spin & tilt (free, no snap) |
| **Scroll while holding** | lift / lower the held stick (or assembly) above its resting pose |
| **Z / X** | roll the held stick (keys are a quiet secondary control) |
| **Release** | it freezes in place (BUILD) so you can prop the next stick; drops gently (RUN) |
| **B** | toggle **BUILD ⇄ RUN** (RUN eases gravity in over ~1s — no slam) |
| **Left-drag empty** | orbit camera · **Right-drag empty** | pan · **Scroll** | zoom (toward the cursor) |
| **1 – 4** | camera angles — ¾ · front · side · top (eased glide, fit to your build) |
| **F** | frame the build — recentre + refit from your current angle |
| **Space** | spawn a new stick at the cursor |
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
- **Surface-inference placement.** No scroll-for-height. A held stick rests on
  whatever's under the cursor (raycast against the table + placed sticks, sit at
  `hit + normal·halfThickness`). The cursor *is* the position.
- **Two-button manipulation, not modal.** Left-drag = move, right-drag = rotate.
  Chosen over the research's full Blender-style modal (G/R) because that over-rotates
  toward CAD for a craft table. Rotation is **free by default** (snapping stays off —
  imperfection is the soul).
- **Stack:** Three.js + Rapier (compat/WASM), zero build step.
- **Glue is phase 2.** When built: wet glue = temporary fixed-joint (repositionable);
  **dry glue = merge the two sticks into one compound rigid body** (this is what keeps
  welded structures from jittering apart).

## What this prototype is testing

Only one question: **is grabbing/placing sticks in 3D with a mouse actually fun, or a
fight with the controls?** Everything else (pretty wood, sound, glue, infinite supply)
is downstream of that answer. If the lean-to is satisfying, the toy has legs.
