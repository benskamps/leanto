# leanto — product roadmap

> **Live:** [brokenbranch.dev/leanto](https://brokenbranch.dev/leanto) · **Repo:** benskamps/leanto
> **Grounded in `git log` + the live `src/` tree, not older plan docs.** Where a plan
> disagreed with git, git won. Shipped through **#10 (OG cards)** as of 2026-07-04.

## North Star

**Did the player feel they *made* the outcome — rather than negotiated with the controls?**

Everything below serves that one question. The scorecard diagnoses the answer; it never
replaces watching a real person build. Snapping stays rejected: forgiveness comes from
better picking, contact inference, previews, and undo — never from a grid.

---

## Where leanto actually is

The original roadmap described a 509-line single-file prototype "with no tests, no build
step" and listed placement/physics/undo as open P0/P1 work. **That is stale.** The
prototype grew up. The monolith is now plain ES modules, the two invalidating bugs
(placement, physics clock) are fixed, and a full builder-ergonomics + material pass has
shipped. What's left is *not more physics* — it's **evidence the toy lands with a
stranger**, and the reach to **share what you made**.

### Shipped (DONE) — was previously roadmapped as open

| Area | What shipped | Ref |
|---|---|---|
| **Modular architecture** | Monolith split into plain ES modules: `audio · charm · glue · main · physics · save · scene · solver · sticks · tools`. Three.js + Rapier, still zero build step. | #3 |
| **Orientation-aware placement** *(was P0 #1)* | `solver.js` casts the body's own rotated cuboid straight down and rests it on whatever it meets — table, flat stick, tilted plank, or stick-end. Nothing interpenetrates. Glued assemblies drop as one group. | #2 |
| **Refresh-rate-independent physics** *(was P0 #2)* | Fixed **120 Hz** clock with an accumulator (`physics.js`), independent of display refresh. `lengthUnit = 0.1` so cm-scale sticks get crisp contact slop. Identical BUILD→RUN reveal on 60 Hz and 144 Hz. | #2 |
| **Glue as a real material** | Assemblies with move-as-one, unglue, dry-glue compounds, 300-stick cap (a cottage is ~200–240 sticks). | #4 |
| **Scroll-to-lift** | Vertical control of the held stick/assembly while holding. | #5 |
| **Snip tool + rounded ends** | Cut sticks; rounded stick ends. | #6 |
| **Builder ergonomics** *(was P1 #1)* | Stamp, **undo**, save/load, **autosave** (every 30 s). Failure is now cheap. | #7 |
| **"CUTE AF" pass** | Full-adorable material/visual polish. | #8 |
| **The Cottage** | Scripting API (`window.__leanto.api`), a bundled showcase scene, and a HUD loader. | #9 |
| **Social cards** | OG / Twitter card meta + social image. | #10 |
| **Diagnostics surface** | `window.__leanto` exposes ready state, frame/step counts, stick count, mode, joint count, and max-drift — the seam an evidence loop plugs into. | #2–#9 |

### Still missing — the real open frontier

- **No pre-grab hover / aim feedback.** A real-scale stick is a few pixels wide; picking
  is still a fight. *(was P0 #4 — the last thing between "wired correctly" and "feels good.")*
- **No evidence / telemetry loop.** Nothing records time-to-first-grab, corrections,
  BUILD→RUN attempts, survival, or a felt-rating. *(was P0 #3.)*
- **No first-build onboarding path** for a first-time visitor.
- **No accessibility pass** — reduced-motion, mute-by-default, keyboard-only construction.
- **No sharing beyond OG cards** — a creation can't be reopened, linked, or submitted.
- **No touch / mobile.** The viewport implies mobile that right-drag-rotate can't deliver.
- **No tests / CI / package manifest**, and deps still load from CDN at runtime.

---

## Product scorecard

Targets are exit gates for public beta, not claims about today. Baseline is captured on
the first five uncoached sessions (Phase B).

| Signal | Definition | Beta target |
|---|---|---:|
| First-build activation | New players who place 3+ sticks and enter RUN without coaching | ≥ 80% |
| Time to reveal | Median time from ready to first BUILD→RUN attempt | ≤ 2 min |
| Control confidence | Players rating manipulation "mostly felt like I intended" | ≥ 4/5 |
| Lean-to success | Players who build a recognizable 3-stick lean-to in 5 min | ≥ 70% |
| Return intent | Players choosing "I want to build one more thing" after the first reveal | ≥ 60% |
| Simulation parity | Same seeded scene at 30, 60, 120 render FPS | Equivalent within pose tolerance |
| Runtime health | Sessions with no uncaught error or unrecoverable state | ≥ 99.5% |
| Performance | 60 FPS at 300 loose sticks on the reference laptop | p95 frame ≤ 20 ms |

---

## Phased arc

Physics and manipulation are done. The arc now runs: **prove it feels good → measure it →
let people share it → deepen the material → harden only what earned it.**

### Phase 0 — Now (done)
Cottage live, OG cards shipped, physics/placement/undo trustworthy. Only open operational
thread: keep `brokenbranch.dev/leanto` in sync with the repo (a shared Lab mirror-sync
need — solve once, reuse for windowsill-lab). *(~1 unit.)*

### Phase A — Trust the toy *(make a stranger succeed unaided)*
The one move if you only do one.

- **Pre-grab hover / aim feedback** — highlight which stick you're about to grab and show
  a translucent preview of where it will rest, so picking a few-pixel stick stops being a
  fight. *(was P0 #4.)*
- **First-build path** — ~20 seconds of "grab → prop → prop → press B" onboarding that
  disappears after the first success and never competes with the tabletop.
- **Accessibility** — reduced-motion, mute-by-default, and a keyboard-only construction path.
- **Gate:** a first-time visitor builds a recognizable 3-stick lean-to in ≤ 5 min with no
  coaching. *(~4–6 units.)*

### Phase B — The evidence loop *(so every later change is measurable)*
- **Local telemetry** off the `window.__leanto` surface: time-to-first-grab, correction
  count, BUILD→RUN attempts, survival result, one-tap "felt like I intended? 1–5." Local
  only, privacy-conscious. *(was P0 #3.)*
- **Seeded before/after test scene** + a tiny harness so a feel change is A/B-able against
  a byte-for-byte reproducible baseline (the scripting API already serializes scenes).
- **Gate:** five observed sessions produce a real keep / change / kill signal. *(~3–5 units.)*

### Phase C — Share what you made
- **Shareable creations** — URL-encode the scene through the #9 scripting API (that's the
  seam), plus gif / screenshot capture from the current camera.
- **Showcase submissions** — "add to showcase" beside the bundled Cottage.
- Shared scenes open **read-only first, then "remix"** into a local copy; seed, camera,
  build state, and glue survive the round-trip.
- **Gate:** the first creation shared that isn't Ben's. *(~4 units.)*

### Phase D — Deepen the material
- **More materials / joints** — glue types, weights, maybe string / tension.
- **Forgiving glue contact model** — require plausible contact for a bond, preview the bond
  location, repositionable wet glue, no duplicate bonds.
- **Touch + mobile** — make the viewport's mobile promise real, or label desktop-only
  honestly. Right-drag-rotate does not work on touch. *(was P2 #3.)*
- **Gate:** return intent — players choose "build one more thing." *(~5–7 units.)*

### Phase E — Harden only what earned it
- **Tests + CI + package manifest** on the invariants playtests *proved* matter — there is
  none today. Placement math and the physics clock are the first pure-testable seams.
- **Resource pooling** for larger scenes; profile 20 / 100 / 300 loose sticks.
- **Vendored / pinned deps** for offline, cold-start, and supply-chain control (today
  Three.js 0.161 + Rapier 0.14 load from CDN at runtime).
- **Gate:** no rewrite or hardening lands until a feature has playtest evidence behind it.
  *(~4 units.)*

---

## Operating rules

- **Clock, not scope, per phase.** A phase passes on its *gate evidence*, not because code
  shipped.
- **One major interaction bet in flight at a time.**
- **Rapier owns physical truth; Three.js mirrors interpolated transforms.**
- **Placement math stays pure and testable; randomness stays seeded and explicit.**
- **A framework or backend is justified only by demonstrated need** — the HUD and current
  sharing model don't demand one yet.

## Non-goals (through Phase C)

Grid or angle snapping · accounts / social feed / marketplace / multiplayer · large
material catalogs before the toy is proven · mobile parity before desktop is validated ·
photorealism that costs legibility or frame rate · a generalized physics editor.

## One-move-if-you-only-do-one

**Phase A hover / aim feedback.** It's the last thing standing between "wired correctly"
and "feels good to a stranger" — and the toy can't earn its evidence loop until a first-time
visitor can actually grab a stick.
