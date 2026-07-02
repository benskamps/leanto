# leanto: 100x product roadmap

## Executive position

`leanto` has a strong toy-sized thesis: handmade placement plus consequential physics can create a satisfying “I made that” moment. The prototype already proves that the stack can render, pick, freeze, release, collide, and glue sticks with very little machinery.

The next move is not more features. It is making the core experiment measurable and physically trustworthy. Today, the code can put a rotated stick partly through its supporting surface, and simulation time advances once per rendered frame. Those two facts can invalidate playtest conclusions: a player may be fighting placement and refresh rate rather than the product idea.

The roadmap therefore follows this order:

1. Make the experiment scientifically trustworthy.
2. Make manipulation feel forgiving and intentional.
3. Give builders confidence to experiment.
4. Deepen the material pleasure and glue fantasy.
5. Add reasons to return and creations worth sharing.
6. Harden only the product that playtests prove deserves hardening.

“100x” is treated as a direction, not a fabricated scalar. The intended compounding effect is roughly 10x faster product learning multiplied by 10x more successful, expressive play sessions.

## SME brief: the product as it exists

### Product thesis

- The emotional target is a tactile craft-table toy, not CAD.
- Imperfection is the differentiator; free placement and physics should remain authoritative.
- BUILD mode acts as a third hand by making placed bodies fixed but collidable.
- RUN mode is the reveal: all sticks become dynamic while gravity ramps in.
- The decisive first-session test is whether a player can make and enjoy a three-stick lean-to without coaching.
- Snapping would erase the product’s character. Forgiveness should come from better picking, contact inference, previews, and undo—not a grid.

### Repository and runtime map

- Current branch: `claude/ns-glue`, one commit ahead of `main`.
- The worktree was clean at audit time.
- `index.html` contains the full 509-line app: UI, Three.js scene, Rapier world, input controller, audio, glue, and render loop.
- Three.js `0.161.0` and Rapier compat `0.14.0` load at runtime from public CDNs.
- There is no package manifest, build step, automated test, CI, telemetry, persistence, backend, or deployment configuration.
- Six slightly randomized fixed sticks seed the BUILD table.
- Pointer raycasts target visible meshes; Rapier cuboids provide collision.
- A stick moves kinematically while held, becomes fixed on release in BUILD, and becomes dynamic on release in RUN.
- Glue is already present on this branch: two selected bodies receive a Rapier fixed joint, with a visual bead parented to the first stick.
- `window.__leanto` exposes a small diagnostic surface for readiness, frame count, stick count, mode, and joint count.

### Verified behavior

The app was served and exercised in a real browser at 1280×720.

- It loaded successfully with no observed console warnings or errors.
- The initial state reported six frozen BUILD sticks.
- Space spawned a seventh stick.
- B transitioned BUILD to live physics.
- G entered glue mode; selecting two visible sticks created one joint.
- The interface remained responsive after those transitions.

This verifies the happy-path wiring. It does not yet verify that building a lean-to feels good—the repository has no repeatable test scene or player evidence for that claim.

## Highest-leverage findings

### P0 — conclusions are not yet trustworthy

1. **Placement is not orientation-aware.** `surfaceTarget()` adds only half the nominal stick thickness to the hit point’s world Y. It does not use the hit normal or the held stick’s rotated support extent. A tilted or vertical stick can therefore be frozen through a table or another stick. This directly compromises the core lean-to test.
2. **Physics is tied to render frequency.** The animation loop calls `world.step()` once per animation frame while its measured `dt` is used only for the gravity ramp. A 120 Hz display can simulate approximately twice as quickly as a 60 Hz display; throttled frames simulate too slowly.
3. **There is no evidence loop.** The README asks the right product question, but the app records no time-to-first-grab, correction count, BUILD→RUN attempt, survival result, or player rating.
4. **The input target is visually honest but ergonomically severe.** A real-scale thin stick can be only a few pixels wide. Picking should be more generous than collision geometry without making placement itself imprecise.

### P1 — builders cannot safely explore

1. Backspace irreversibly removes everything; there is no undo, redo, autosave, or confirmation.
2. BUILD/RUN and GLUE are keyboard-only state changes with tiny status feedback. Key repeat is not filtered, so a held toggle key may switch repeatedly.
3. Camera and object manipulation share the same canvas and buttons. The code disables camera controls after a successful stick hit, but there is no hover or pre-grab feedback to help a player predict which action will occur.
4. Glue allows non-contacting sticks and duplicate bonds. “Wet glue is repositionable” is not yet true in the interaction model: there is no unglue action, and moving one member of a joined assembly is not treated as an assembly transform.
5. The first paragraph promises “real gravity,” while the world deliberately uses gentler-than-Earth gravity. The feel may be right, but the product language and physics contract disagree.

### P2 — scale and release risks

1. The single-file architecture makes pure unit tests and safe iteration increasingly difficult, but a framework rewrite would be premature.
2. Runtime CDN imports make cold start, offline use, reproducibility, and supply-chain control dependent on third parties.
3. Desktop mouse controls are the real supported platform; the viewport metadata suggests mobile support that right-click rotation cannot deliver.
4. Every stick owns geometry and material resources. The cap of 140 is reasonable for the prototype, but performance budgets and pooling should precede larger scenes.
5. The HUD explains controls but competes with the tabletop. There is no progressive onboarding, focus order, reduced-motion/audio treatment, or keyboard-only construction path.

## Product scorecard

Sprint 0 establishes the baseline; targets below are exit gates, not claims about current performance.

| Signal | Definition | Beta target |
|---|---|---:|
| First-build activation | New players who place 3+ sticks and enter RUN without coaching | ≥ 80% |
| Time to first reveal | Median time from ready state to first BUILD→RUN attempt | ≤ 2 min |
| Control confidence | Players rating manipulation “mostly felt like I intended” | ≥ 4/5 |
| Lean-to success | Players who can create a recognizable three-stick lean-to in 5 min | ≥ 70% |
| Return intent | Players choosing “I want to build one more thing” after the first reveal | ≥ 60% |
| Simulation parity | Same seeded scene at 30, 60, and 120 render FPS | Equivalent within defined pose tolerance |
| Runtime health | Sessions with no uncaught error or unrecoverable state | ≥ 99.5% |
| Performance | 60 FPS at 140 loose sticks on the reference laptop | p95 frame ≤ 20 ms |

The north-star question remains qualitative: **did the player feel they made the outcome, rather than negotiated with the controls?** The metrics diagnose that answer; they do not replace observation.

## Delivery operating system

Assumptions: one product-minded engineer, two-week sprints, desktop web first, and five lightweight playtests at the end of every product sprint.

Every sprint must have:

- one falsifiable interaction or retention hypothesis;
- a seeded before/after test scene;
- automated coverage for new invariants;
- five observed player sessions or a written reason the sprint is infrastructure-only;
- an end-of-sprint keep/change/kill decision;
- no more than one major interaction bet in flight.

Features do not pass because they shipped. They pass because the exit evidence says the next sprint is still worth funding.

## Sprint sequence

### Sprint 0 — Baseline and safety rails (week 1)

**Hypothesis:** A reproducible harness will make every later feel change faster and safer to evaluate.

Ship:

- Record five uncoached sessions on the untouched prototype and capture the scorecard baseline.
- Add a deterministic random seed and a named “lean-to test” scene.
- Add a minimal local toolchain: pinned dependencies, Vite, TypeScript checking, Vitest, Playwright smoke coverage, and CI.
- Extract only high-change seams from the monolith: physics clock, placement solver, input state, scene serialization, and diagnostics. Keep Three.js plus plain DOM; do not add a UI framework.
- Serve dependencies locally in production builds and preserve the current visual/behavioral baseline.
- Document supported browser/desktop assumptions and reconcile README claims with the glue branch.

Exit gate:

- Cold start, spawn, BUILD→RUN, GLUE, and sweep have automated smoke checks.
- A seeded scene can be recreated byte-for-byte from serialized state.
- Five baseline sessions are summarized with failures categorized as discoverability, selection, placement, rotation, camera, or physics.

### Sprint 1 — Trustworthy contact and time (weeks 2–3)

**Hypothesis:** Correct support placement and refresh-rate-independent physics will remove the largest sources of “the toy cheated.”

Ship:

- Replace the world-Y offset with an orientation-aware support solver: transform the hit normal, compute the rotated box support distance, and place the held body outside the contacted surface.
- Handle table, flat-stick, tilted-stick, and stick-end contacts; reject or visibly mark unresolved penetration.
- Add a translucent placement preview and contact point/normal debug mode.
- Run Rapier with a fixed simulation timestep, bounded accumulator, and render interpolation.
- Make gravity ramp simulation-time based.
- Add deterministic regression scenes for 0°, 45°, and 90° placement and for 30/60/120 FPS rendering.

Exit gate:

- No test pose begins RUN interpenetrating its support beyond tolerance.
- Seeded final poses are equivalent across 30, 60, and 120 render FPS.
- At least four of five baseline testers report fewer “mystery” outcomes in a comparison session.

### Sprint 2 — Forgiving manipulation (weeks 4–5)

**Hypothesis:** Generous targeting plus clear pre-action feedback will improve control confidence without introducing snapping.

Ship:

- Separate generous invisible pick proxies from physically accurate colliders.
- Add hover outline, selected-state outline, cursor changes, and a surface/pose preview before release.
- Make camera-versus-stick intent explicit and test drag thresholds to prevent click jitter.
- Tune rotation around a stable grabbed pivot; keep free rotation and preserve Z/X roll.
- Ignore key-repeat for mode toggles; add visible BUILD/RUN and GLUE controls with keyboard parity.
- Add camera home/reset and a compact first-use coachmark that disappears after success.
- Instrument grab misses, immediate re-grabs, mode toggles, corrections, and time to first reveal locally; provide an exportable session summary.

Exit gate:

- First-build activation reaches 80% in five uncoached sessions.
- Median time to first reveal is at most two minutes.
- No tester needs verbal explanation of whether they will move a stick or the camera.

**Decision gate A:** If lean-to success is still below 50%, do not proceed to cosmetic work. Run a focused rotation/placement redesign spike and retest.

### Sprint 3 — Safe experimentation (weeks 6–7)

**Hypothesis:** Undo and persistence will make players attempt more ambitious structures because failure is cheap.

Ship:

- Introduce a command history for spawn, transform, glue, unglue, mode change, delete, and sweep.
- Add undo/redo, single-stick delete, duplicate, and a recoverable “clear table.”
- Autosave locally after stable edits; restore after refresh or crash.
- Create a versioned scene format containing seed, transforms, body mode, joints, and camera.
- Add named local saves and reset-to-seed.

Exit gate:

- Twenty mixed actions round-trip through undo/redo without state drift.
- Reload restores a glued scene and camera exactly within tolerance.
- Playtesters make at least 2x as many deliberate experiments before choosing to reset versus baseline.

### Sprint 4 — Material pleasure (weeks 8–9)

**Hypothesis:** Better material response will turn technically correct manipulation into a toy people want to touch again.

Ship:

- Upgrade rendering from plain boxes to softly rounded stick meshes while preserving simple, stable collision shapes.
- Add restrained per-stick bow, edge wear, hue, grain, and thickness variation driven by the scene seed.
- Drive clacks from contact impulse and material context; vary pitch and loudness without audio spam.
- Improve contact shadows and selected-object legibility without losing the quiet tabletop aesthetic.
- Pool/reuse geometry and profile 20, 60, and 140-stick scenes.
- Respect mute, reduced motion, and lower-quality rendering preferences.

Exit gate:

- Reference hardware holds the performance budget at 140 loose sticks.
- At least four of five testers describe the interaction with a tactile/material word unprompted.
- Visual variation remains reproducible from a saved seed.

### Sprint 5 — Glue as a real material (weeks 10–11)

**Hypothesis:** Contact-aware, reversible glue will expand expression without becoming an invisible cheat.

Ship:

- Require plausible contact/proximity for a bond and show the proposed bond location before creation.
- Prevent duplicate bonds and surface invalid selections with a clear reason.
- Represent bonded sticks as an assembly graph; grabbing a bonded member moves the assembly coherently in BUILD.
- Add unglue and repositionable wet-glue states to command history and serialization.
- Implement dry glue as a stable compound rigid body only after wet-glue behavior passes tests.
- Preserve per-stick visuals while making dry assemblies sleep and collide as one body.

Exit gate:

- A 20-stick bonded structure runs for 60 seconds without joint explosion or visible pose drift.
- Bond, move assembly, undo, redo, save, reload, and unglue all preserve the intended relative transforms.
- Remote and duplicate bonds are impossible through normal input.

### Sprint 6 — Reasons to build (weeks 12–13)

**Hypothesis:** Light prompts will help new players discover expressive depth without turning the toy into a puzzle grid.

Ship:

- Add three opt-in prompts: lean-to, bridge a gap, and tallest stable tower.
- Judge physical outcomes such as stability time, span, and height—not exact poses or snapped silhouettes.
- Give each prompt one visual example, a resettable seeded table, and a celebratory but quiet result card.
- Add a free-build entry that remains the default for returning builders.
- Record prompt start, reveal, completion, retry, and abandonment in the local session summary.

Exit gate:

- 80% of new testers complete at least one prompt without coaching.
- At least 60% choose either another prompt or free build after completion.
- No tester believes there is a hidden required angle or snap point.

**Decision gate B:** Continue toward sharing only if return intent reaches 60% or qualitative evidence identifies a specific, fixable blocker. Otherwise deepen the toy before adding distribution.

### Sprint 7 — Save, show, and replay (weeks 14–15)

**Hypothesis:** A creation becomes more valuable when it can be reopened and shown without losing its physical character.

Ship:

- Export/import a compact, versioned scene file with validation and migration hooks.
- Generate a clean thumbnail and build summary from the current camera.
- Add share-by-link only if payload size is safe; otherwise use a deliberately small persistence service.
- Make shared scenes open read-only first, then “remix” into a local copy.
- Preserve the seed, camera, build state, and glue state across the share round-trip.

Exit gate:

- 95% of a fuzzed corpus of valid scenes round-trips without material pose drift.
- Invalid or newer-version scenes fail safely with a useful message.
- At least three of five testers voluntarily share or remix a creation.

### Sprint 8 — Public beta hardening (weeks 16–17)

**Hypothesis:** The validated desktop toy can reach strangers without support-heavy failures.

Ship:

- Production deployment, cache/version strategy, error reporting, and opt-in privacy-conscious product analytics.
- Browser matrix coverage, WebGL/WASM capability fallback, loading progress, retry, and offline shell.
- Accessibility pass for menus, status announcements, contrast, focus, reduced motion, and audio controls.
- Make an explicit mobile decision: label desktop-only clearly or fund a touch manipulation sprint. Do not imply right-click controls work on touch.
- Add performance budgets, dependency update policy, security headers, and release rollback instructions.
- Run a 25-person external beta with a scripted feedback survey and session review rubric.

Exit gate:

- Runtime health reaches 99.5% in the external beta.
- Scorecard beta targets are met or each miss has a tested causal explanation.
- A written go/pivot/stop decision chooses the next product frontier.

## Architecture direction

Keep the system small, browser-native, and physics-led. The target is modular seams, not enterprise ceremony.

```text
app/bootstrap
├── scene/sticks + materials
├── physics/world + fixed clock
├── interaction/input state + placement solver
├── assemblies/glue graph
├── state/commands + scene format
├── presentation/HUD + prompts
└── diagnostics/session metrics
```

Rules:

- Rapier owns physical truth; Three.js mirrors interpolated transforms.
- The command/state layer owns edit history and serialization; renderer objects and Rapier handles are runtime adapters, never the save format.
- Placement math is pure and unit-tested wherever possible.
- Randomness is seeded and passed explicitly.
- Interaction state is finite and named (`idle`, `hover`, `move`, `rotate`, `glue-first`, `glue-second`) rather than inferred from scattered booleans.
- A framework is justified only when UI complexity demonstrates the need. The current HUD does not.
- A backend is justified only after sharing or multi-device persistence passes Decision gate B.

## Explicit non-goals through Decision gate B

- Grid or angle snapping.
- Accounts, social feed, marketplace, multiplayer, or user-generated scripts.
- Large material catalogs.
- Mobile parity before desktop manipulation is validated.
- Photorealism that reduces legibility or frame rate.
- A generalized physics editor.

## First 72 hours

1. Tag or otherwise preserve the audited build as the baseline.
2. Run five uncoached lean-to sessions before changing interaction behavior.
3. Capture one deterministic failing scene for a 45° stick and one for a vertical stick.
4. Implement and test the fixed physics clock behind current behavior.
5. Write the orientation-aware support solver as a pure function with table/flat/tilted/vertical fixtures.
6. Re-run the same five people, or five comparable players, and make the first keep/change/kill decision.

That sequence buys more truth per day than adding another material, tool, or game mode.
