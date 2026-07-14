# leanto — the 100× roadmap

> **Post-#15 plan · 2026-07-13**
> Grounded in the current `main` branch, a headed Chromium playthrough, the bundled
> Cottage, the 300-stick ceiling, and the live source. This replaces the roadmap that
> still listed hover feedback, local metrics, and camera framing as open work.

## The call

**Stop adding tools until holding one stick feels self-evident.**

leanto has enough toy already: placement, physics, glue, snip, stamp, undo, save/load,
the Cottage, photo mode, telemetry, aim preview, and a capable camera all exist. The
problem is that the player meets those capabilities as a paragraph of keyboard and
mouse instructions. The interaction model asks them to remember left-drag, right-drag,
scroll-during-hold, six rotation keys, modes, and overloaded empty-space gestures before
they have made anything.

The next release is therefore not a feature sprint. It is a **control-system rewrite at
the input layer, a workbench UI pass, and a measured performance pass**. Sharing follows
only after a stranger can build without reading the manual.

### Implementation checkpoint — working tree

The first control-first vertical slice is now implemented:

- explicit interaction state + a single command/help registry;
- click-to-select without moving the object, a 4 px drag threshold, captured move gestures, direct endpoint/lift/roll
  handles, exact Escape/pointer-cancel restoration, and legacy right-drag kept only as fallback;
- semantic workbench shell, contextual hints, persistent BUILD/RUN, visible tools, generated
  Help, responsive 390×844 layout, mute-first audio, reduced motion, and keyboard transforms;
- stable BUILD physics suspension with one maintenance step per mutation, DPR capped at 1.5,
  2048² interactive shadows, dropped-backlog diagnostics, and reproducible `api.stress()` /
  `api.measure()` hooks.

Fresh Chromium results at 930×930 after that slice: Cottage RUN p95 **17.4 ms**; 300-stick
BUILD p95 **17.2 ms** with **0 Hz idle physics**; 300-stick RUN p95 **17.3 ms**, p99 23 ms,
120.3 Hz physics, and zero dropped backlogs. Human-session gates and URL sharing remain open.

“100×” is a direction, not a vanity metric. The release earns the name when a new player
can see what is actionable, manipulate it directly, recover cheaply, and reach the RUN
reveal without translating an instruction sheet.

## North Star

> **Did the player feel they made the outcome, rather than negotiated with the controls?**

Three supporting promises:

1. **The object teaches the gesture.** Handles, contact previews, and state changes live
   on the stick—not in permanent prose over the table.
2. **One gesture has one meaning.** Input conflicts are resolved by explicit state and
   target priority, not scattered event-handler conditionals.
3. **Beauty cannot hide latency.** The hand-to-stick loop gets the first frame-time
   budget; shadows and sparkle spend what remains.

Snapping remains rejected. Forgiveness comes from generous picking, direct handles,
contact inference, previews, undo, and better camera behavior—not a grid.

---

## Where the product actually is

### Shipped through #15

| System | Current state |
|---|---|
| Physics | Rapier, 120 Hz fixed clock, cm-scale contact tuning, BUILD ⇄ RUN gravity reveal |
| Placement | Orientation-aware surface inference for individual sticks and glued assemblies |
| Making | Move, free rotation, lift, glue/unglue, snip, stamp, half-sticks, 300-stick cap |
| Recovery | Undo in BUILD, autosave, JSON save/load, destructive-action confirmation |
| Camera | Orbit/pan/zoom-to-cursor, four fitted views, frame-build, interruptible glides |
| Feedback | Generous screen-space picking, hover emissive, lifted-stick rest ghost, sound/charm |
| Evidence | Local session metrics, seeded three-stick test scene, survival and feel prompt |
| Showcase | 134-stick / 247-bond Cottage, scripting API, photo mode, OG cards |

### Audit findings

| Severity | Finding | Why it matters |
|---|---|---|
| **P0** | Rotation is split across right-drag, Q/E, R/F, and Z/X. | The hardest action has the least visible model and no touch equivalent. |
| **P0** | The default HUD is a dense control sheet over the work surface. | It obscures both sticks and contrast, especially as the camera moves under it. |
| **P0** | Picking, tools, and camera gestures share the same canvas handlers. | A miss silently changes “manipulate” into “move the camera”; intent is not stable. |
| **P0** | The 390×844 layout presents desktop controls but cannot perform them. | The viewport makes a promise the input model breaks; HUD, status, and resume prompts overlap. |
| **P1** | Tool and world mode are mostly text in the top-right status line. | Selection, BUILD/RUN, glue state, and valid targets need persistent spatial feedback. |
| **P1** | Interactive HUD elements are styled `div`s and keyboard construction is incomplete. | Focus, activation, screen-reader semantics, and non-pointer building are not coherent. |
| **P1** | Stable BUILD still runs the render loop and 120 Hz physics. | The quiet editing state spends the same clock budget as live collapse. |
| **P1** | Rendering uses per-stick materials, up to 2× DPR, and a fixed 4096² shadow map. | The visual path is expensive before the 300-stick physics stress begins. |
| **P2** | Controls copy is duplicated across `README.md`, the HUD, and event handlers. | Bindings will drift again unless UI copy is generated from one command registry. |
| **P2** | CDN modules remain runtime dependencies and there is no automated interaction/perf gate. | Cold start and regressions depend on external services and manual memory. |

### Measured baseline on this workstation

Headed Chromium, 930×930 viewport, 180-frame samples after warm-up. These numbers are
directional local baselines, not claims about every player device.

| Scene | State | Result |
|---|---|---:|
| Cottage · 134 sticks / 247 bonds | RUN | 60.2 FPS · p95 18.3 ms · p99 18.8 ms · physics 120.4 Hz |
| 300 loose sticks | BUILD | 60.1 FPS · p95 17.6 ms · p99 18.5 ms |
| 300 loose sticks | RUN | 60.1 reported FPS · **p95 25.5 ms** · p99 26.9 ms |

The last row misses the existing p95 ≤20 ms target despite the average looking healthy.
Percentiles and dropped physics backlog—not average FPS—become the release gate.

---

## The new control schema

### 1. Separate world state, tool state, selection, and gesture

Today those concepts are implicit across booleans and event handlers. Make them one
inspectable controller state:

```js
interaction = {
  world:     'build' | 'run' | 'photo',
  tool:      'hand' | 'glue' | 'snip' | 'stamp',
  selection: { ids: [], primary: null },
  gesture:   'idle' | 'move' | 'orient' | 'lift' |
             'orbit' | 'pan' | 'zoom' | 'tool-action',
  target:    'handle' | 'stick' | 'glue-bead' | 'table' | 'ui' | null,
  device:    'mouse' | 'touch' | 'keyboard',
};
```

The controller owns pointer capture, commit, cancel, undo boundaries, camera parking,
and the visible affordance. Physics remains authoritative; this is an intent layer, not
a new transform system.

### 2. Define commands once and generate help from them

Bindings, guards, labels, tooltips, onboarding hints, and analytics names come from a
single registry rather than hard-coded prose:

```js
{
  id: 'orient',
  when: { world: ['build', 'run'], tool: 'hand', target: 'end-handle' },
  bindings: {
    mouse:    'primary-drag',
    touch:    'drag',
    keyboard: 'R + arrows',
  },
  lifecycle: { commit: 'release | Enter', cancel: 'Escape | pointercancel' },
  ui: { label: 'Aim', hint: 'drag an end', analytics: 'stick_orient' },
}
```

The README control table, compact help, tooltips, and first-use hints are rendered from
this registry. A binding change then has one source of truth.

### 3. Resolve conflicts by a fixed target ladder

From highest to lowest priority:

1. confirmation or dialog;
2. active captured gesture;
3. active tool target;
4. selected-stick handle;
5. stick body;
6. empty table/canvas camera gesture.

The target is decided on pointer-down and remains captured until commit or cancel. A
near-miss can no longer become an accidental camera orbit halfway through the gesture.

### 4. Direct-manipulation map

| Intent | Mouse / trackpad | Touch | Keyboard | Visible response |
|---|---|---|---|---|
| Select + move | Primary-drag stick body | Drag stick body | Tab/Shift+Tab, arrows | Outline, held shadow, rest/contact ghost |
| Aim / tilt | Drag either endpoint handle | Drag endpoint handle | Hold R + arrows | Opposite end becomes pivot; live arc and landing preview |
| Lift | Drag vertical handle; wheel remains a shortcut | Drag vertical handle | PageUp/PageDown | Height stem, table shadow, numeric-free depth ticks |
| Roll | Drag small twist ring | Two-finger twist on selection | `[` / `]` | Ring fills in the direction of roll |
| Orbit | Primary-drag truly empty table | One-finger drag empty table | 1–4 views | Small orientation rose moves with camera |
| Pan | Shift-drag or middle-drag empty table | Two-finger drag | Shift+arrows | Table edge clamp becomes briefly visible |
| Zoom | Wheel / pinch | Pinch | `+` / `-` | Cursor-anchored zoom; no mode change |
| Add stick | Click **+ stick**; Space remains | Tap **+ stick** | Space | New stick appears selected under pointer/centre |
| Glue | Choose Glue, then two contact-highlighted sticks | Same | G, then Enter | First target inked; legal contacts glow; invalid reason shown |
| Snip | Choose Snip, drag cut marker, confirm | Same | S, arrows, Enter | Persistent cut line and two-piece preview |
| Duplicate | **Duplicate** selected stick; drag to stamp-run | Same | D | Translucent next copy before placement |
| Reveal | Persistent BUILD/RUN switch | Same | B | Whole workbench changes state; motion warning if applicable |
| Cancel / recover | Escape or secondary click; Undo button | Two-finger tap or Undo | Escape / Ctrl+Z | Gesture reverts to its captured start pose |

**Right-drag rotation is removed from the primary model.** It can survive for one release
as a deprecated expert binding, but onboarding and help never teach it. Endpoint handles
make orientation spatial: the player aims a real stick end instead of operating an
invisible three-axis trackball.

### 5. Control invariants

- Pointer-down on a stick never moves the camera.
- Every active gesture can be cancelled back to its exact starting pose.
- Every destructive or structural action creates one comprehensible undo step.
- No essential action depends on hover, right-click, or a wheel.
- Handles remain a constant 28–36 CSS px on screen and never shrink with zoom.
- Hidden geometry may be selected through a deliberate “cycle target” action, never by
  random ray-hit order.
- RUN can limit structural edits, but it must explain why instead of playing only a deny sound.

---

## Visual direction — “a workbench, not a README”

### Default composition

```text
┌ leanto                                      [undo] [help] ┐
│                         [ BUILD  |  RUN ]                 │
│                                                            │
│       contextual hint, anchored near the relevant stick    │
│                                                            │
│                    ──●════════●──                           │
│                       │ lift                                │
│                       ◇                                     │
│                                                            │
│ [Hand]  [+ Stick]  [Glue]  [Snip]  [Duplicate]     [sun]  │
└────────────────────────────────────────────────────────────┘
```

The table owns the viewport. The initial screen shows at most one sentence: **“Drag a
stick.”** After the first successful placement it becomes **“Drag an end to lean it.”**
After a three-stick structure it becomes **“RUN it.”** Completed hints disappear forever
and remain available under Help.

### Visual language

- **Selection:** a thin dark-ink silhouette plus two warm endpoint beads. Do not rely on
  emissive brightness alone against both day and night lighting.
- **Move:** a soft footprint and contact shadow at the solved rest pose.
- **Orient:** one endpoint pins visually; the dragged end gets an arc and a translucent
  swept-volume preview.
- **Lift:** a single vertical stem connects object to its ground ghost. No XYZ gizmo.
- **Glue:** amber contact dots appear only where a valid partner exists; the first stick
  receives an ink edge and candidate partners breathe once, then settle.
- **Invalid:** preserve the object, tint the attempted contact rust-red, and state the
  reason in 2–4 words (“not touching”, “BUILD only”, “already glued”).
- **BUILD:** calm parchment/ochre treatment, frozen badge, tool rail available.
- **RUN:** deeper ink/rust treatment, motion badge, edit tools visibly disabled—not hidden.
- **Camera:** a tiny compass/house rose replaces another line of keyboard prose.
- **Contrast:** move all UI text off the variable-lit table onto compact opaque-enough
  paper surfaces; meet WCAG AA for normal-size UI text.

### Responsive rule

Until touch controls ship, widths below 700 px receive an honest, attractive
“desktop build / mobile gallery” state. After Sprint 5, the tool rail becomes a thumb
rail, BUILD/RUN remains top-centre, help becomes a sheet, and the canvas receives the
same target ladder as desktop. Do not keep serving unusable desktop instructions to touch.

---

## Performance plan

### Budgets

| Signal | 100× gate |
|---|---:|
| Hover/target feedback latency | p95 ≤ 50 ms |
| Pointer-to-object visual latency while dragging | p95 ≤ 33 ms |
| Cottage RUN · 134 sticks / 247 bonds | p95 ≤ 18 ms · p99 ≤ 25 ms |
| 300 loose sticks RUN | p95 ≤ 20 ms · p99 ≤ 33 ms |
| Stable BUILD, no gesture/camera/tween | 0 physics steps and render-on-demand after settle |
| Physics backlog drops in the Cottage 10-second run | 0 |
| Uncaught errors / unrecoverable interaction state | ≥ 99.5% clean sessions |

### Benchmark matrix

Automate the existing scripting API into named scenarios:

- six-stick empty table, BUILD idle and one held stick;
- seeded three-stick lean-to, BUILD and RUN;
- Cottage, BUILD and a 10-second RUN;
- 300 loose sticks, BUILD, first two collision-heavy RUN seconds, and settled RUN;
- 1440×900 at DPR 1 and 2; 390×844 once touch exists.

Record p50/p95/p99 frame interval, render CPU time, physics-step time, actual physics Hz,
accumulator drops, draw calls, triangles, active bodies, heap, and input latency. Store
baseline JSON beside the harness so a visual change cannot quietly spend 8 ms.

### Optimization order

1. **Measure components, not just rAF.** Add renderer/physics/input marks and a tiny dev
   overlay; make the scenarios runnable from `window.__leanto` and CI.
2. **Stop idle work.** In stable BUILD, stop the 120 Hz step and render on dirty events;
   explicitly refresh scene queries after fixed/kinematic changes. Keep RUN at fixed 120 Hz.
3. **Make quality adaptive.** Begin at DPR 1.25–1.5, raise only with budget; use a 2048²
   shadow default and fit its camera to the visible build. Preserve 4096 as photo quality.
4. **Reduce draw submission.** Batch unselected sticks by geometry bucket with instance
   colour/matrix; temporarily promote hovered/held/tool-target sticks to interactive meshes.
5. **Bound picking work.** Replace 300-stick × 50 Hz full projection scans with cached
   screen bounds or a small spatial index, invalidated by camera/object movement.
6. **Pool transient visuals.** Reuse glue highlights, ghosts, cut previews, motes, and
   selection handles; keep allocations out of pointermove and render paths.
7. **Pin the runtime.** Add a package/build manifest, vendor exact Three/Rapier versions,
   and remove CDN availability from cold-start correctness.

Do not lower the RUN physics rate or disable CCD to win a benchmark. Those change the toy.

---

## Sprint sequence

Effort is expressed in focused engineering days. Gates, not dates, advance the roadmap.

### Sprint 0 / #16 — Baseline the hand *(1–2 days)*

**Build:** named interaction/performance scenarios, frame percentile capture, input event
log, and five fresh uncoached sessions using the current controls. Record mis-grabs,
accidental camera moves, orientation attempts, correction loops, and time to first RUN.

**Gate:** a checked-in baseline report can reproduce the 6 / 3 / 134 / 300-stick matrix;
five sessions identify the top three control failures with screen recordings or notes.

### Sprint 1 / #17 — The Hand: new interaction kernel *(4–6 days)*

**Build:** `InteractionController`, command registry, target-priority ladder, pointer
capture, exact cancel/commit poses, selected-stick state, screen-sized endpoint/lift/roll
handles, and generated compact help. Keep old right-drag behind a temporary compatibility flag.

**Gate:** 8/10 new players can pick up, move, lean, lift, and place one stick without
reading control prose; accidental camera activation after a stick pointer-down is zero.

**Kill switch:** if endpoint aiming is slower than old right-drag after two prototypes,
test a selected-stick arcball handle—not another modifier-key matrix.

### Sprint 2 / #18 — The Workbench shell *(3–5 days)*

**Build:** bottom tool rail, persistent BUILD/RUN switch, visible Undo and Add Stick,
context state, semantic buttons/focus order, anchored three-beat onboarding, help sheet,
and compact desktop/mobile-gallery layouts. Remove the default instruction wall.

**Gate:** median first meaningful action ≤10 seconds; ≥80% place three sticks and enter
RUN without coaching; no UI overlaps at 700–1920 px widths.

### Sprint 3 / #19 — Contact confidence *(3–5 days)*

**Build:** contact footprint, always-legible selection edge, pivot/arc/swept orientation
preview, lift stem, occluded-target cycling, glue candidate contacts, explicit invalid
reasons, and tool-specific previews with one-step undo.

**Gate:** re-grabs/corrections per successful placement fall ≥35% from Sprint 0; ≥70%
build a recognizable unglued three-stick lean-to in five minutes; control rating ≥4/5.

### Sprint 4 / #20 — Earn the 300-stick ceiling *(4–6 days)*

**Build:** component profiler, idle BUILD scheduling, adaptive DPR/shadows, fitted shadow
bounds, stick batching/instancing, bounded picking, transient pools, and regression gates.

**Gate:** all performance budgets above pass three consecutive runs; visual comparison
keeps contact shadows, wood variation, selection clarity, and Cottage silhouette intact.

### Sprint 5 / #21 — Touch and access are real controls *(5–8 days)*

**Build:** pointer-device abstraction, touch target sizes, one/two-finger camera gestures,
handle manipulation, keyboard selection/manipulation, focus-visible treatment, reduced
motion, mute-first preference, high-contrast affordances, and honest screen-reader labels.

**Gate:** the same seeded lean-to is buildable at 390×844 by touch and keyboard-only;
no essential action requires hover, secondary click, wheel, colour alone, or animation.

### Sprint 6 / #22 — Share the thing the controls earned *(4–6 days)*

**Build:** versioned URL scene payload, camera/seed/daylight round-trip, screenshot capture,
read-only shared opening, explicit **Remix** into local state, and a payload size/failure UI.

**Gate:** the first creation from someone other than the author is opened from a link and
remixed successfully; corrupt/oversized links fail safely without losing the current table.

### Sprint 7 / #23 — 100× beta decision *(2–3 days)*

**Build:** ten uncoached sessions, before/after comparison against Sprint 0, compatibility
binding removal, docs generated from the registry, pinned dependencies, smoke CI, and a
public performance/interaction scorecard.

**Gate:** ship only if the scorecard passes. If control confidence or correction rate
misses, spend the release on the hand—not on more materials, joints, or showcase content.

---

## Release scorecard

| Signal | Definition | 100× target |
|---|---|---:|
| First meaningful action | Ready → first intentional stick move | median ≤10 s |
| First-build activation | New players placing 3+ sticks and entering RUN uncoached | ≥80% |
| Time to reveal | Ready → first BUILD→RUN attempt | median ≤90 s |
| Mis-grab rate | Pointer-down attempts that select no intended stick or orbit accidentally | ≤5% |
| Correction load | Re-grabs/repositions per successful placement | ≥35% below baseline |
| Control confidence | “Mostly felt like I intended” | ≥4/5 |
| Lean-to success | Recognizable unglued three-stick structure within 5 min | ≥70% |
| Recovery confidence | Players who successfully undo/cancel one mistake | ≥90% |
| Return intent | “I want to build one more thing” | ≥60% |
| Runtime health | Sessions without uncaught error or unrecoverable state | ≥99.5% |
| Performance | 300 loose sticks RUN | p95 ≤20 ms |

## Operating rules

- One major interaction bet in flight at a time; prototype handles before polishing them.
- Test the hand with unglued three-stick builds. Glue must not conceal manipulation debt.
- Rapier owns physical truth; Three mirrors interpolated transforms.
- Placement math stays pure; randomness stays seeded and explicit in tests.
- Performance changes require before/after percentiles and visual comparison.
- Accessibility bindings are first-class registry entries, not a cleanup pass.
- A framework or backend still needs demonstrated product need.

## Non-goals through #21

Grid or angle snapping · accounts · social feed · marketplace · multiplayer · a large
material catalog · a generalized physics editor · a visual redesign that sacrifices
table/stick warmth · a physics rewrite · a mobile layout without mobile manipulation.

## One move if only one move ships

**Sprint #17: direct endpoint + lift handles on top of an explicit interaction controller.**

That single move removes the invisible rotation model, gives mouse and touch the same
spatial language, makes state legible, creates a clean seam for keyboard access, and lets
the permanent instruction wall disappear. Everything else compounds from it.
