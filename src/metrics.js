// metrics.js — the evidence loop.
//
// A feather-light, strictly-local session recorder. NO network, NO third party,
// NO analytics vendor. Everything lives in memory on window.__leanto.metrics and
// (optionally) a single localStorage row, so a session is inspectable in the
// console and a before/after feel comparison is measurable. This is a toy, not a
// growth-hack: the numbers exist to answer one question the ROADMAP scorecard
// asks — "did the player feel they made the outcome?" — and nothing is ever sent
// anywhere.
//
// Signals (see ROADMAP "Product scorecard"):
//   - time-to-first-grab   : ms from ready to the first stick pickup
//   - correction count     : grabs vs placements, plus immediate re-grabs
//   - BUILD->RUN attempts  : how many times the reveal was triggered
//   - run survival         : did the last reveal still stand after a few seconds
//   - one-tap feel rating  : 👍/👎 shown once, right after the first reveal
//
// Design constraints: event-driven only (nothing on the physics/render hot path),
// tiny surface, silent. Survival is judged on a real-time timer that reads the
// drift already tracked by main's runWatch (window.__leanto.maxDrift).

export function createMetrics(ctx) {
  const STORE_KEY = 'leanto.metrics';
  const SURVIVE_AFTER_MS = 6000;   // "still standing after N seconds"
  const SURVIVE_DRIFT = 0.03;      // metres of allowed wander before we call it a collapse
  const RIDGE_MIN = 0.02;          // below this, nothing was really standing (flat table)

  // the live, inspectable record — mounted on the existing diagnostic surface
  const m = {
    startedAt: Date.now(),
    readyMs: null,          // performance.now() at ready, session clock origin
    timeToFirstGrabMs: null,
    grabs: 0,
    placements: 0,
    regrabs: 0,             // grabbing the same stick right after setting it down (a re-adjust)
    get corrections(){ return Math.max(0, m.grabs - m.placements) + m.regrabs; },
    runAttempts: 0,
    runsSurvived: 0,
    runsCollapsed: 0,
    lastRun: null,          // { survived, maxDrift, ridge0, ridge1, sticks }
    feelRating: null,       // 'up' | 'down' | null
    feelRatedMs: null,
  };

  let lastReleased = null;  // for re-grab detection
  let feelPrompted = false; // one-tap rating shows at most once per session
  let surviveTimer = null;
  let runRidge0 = 0;

  function persist(){
    try {
      // a plain snapshot only — no functions, no identifiers, nothing personal
      localStorage.setItem(STORE_KEY, JSON.stringify(snapshot()));
    } catch (_) { /* private mode / disabled storage — silently skip */ }
  }

  function ridgeNow(){
    let r = 0;
    for (const s of ctx.sticks) if (s.currPos.y > r) r = s.currPos.y;
    return r;
  }

  // ---------- event hooks (called from main; all off the hot path) ----------
  function onReady(){ if (m.readyMs == null) m.readyMs = performance.now(); }

  function onGrab(rec){
    m.grabs++;
    if (m.timeToFirstGrabMs == null && m.readyMs != null)
      m.timeToFirstGrabMs = Math.round(performance.now() - m.readyMs);
    if (rec && rec === lastReleased) m.regrabs++;   // picked the same one straight back up
  }

  function onRelease(rec){ lastReleased = rec; }

  function onPlace(){ m.placements++; }             // a BUILD-mode set-down = a placement

  // BUILD -> RUN reveal: count it, arm the survival watch, offer the one-tap rating.
  function onRunReveal(){
    m.runAttempts++;
    runRidge0 = ridgeNow();
    if (surviveTimer) clearTimeout(surviveTimer);
    surviveTimer = setTimeout(judgeSurvival, SURVIVE_AFTER_MS);
    if (!feelPrompted) showFeelPrompt();
  }

  // RUN -> BUILD (or sweep): the run ended before we could judge it — cancel quietly.
  function onBuildReturn(){
    if (surviveTimer){ clearTimeout(surviveTimer); surviveTimer = null; }
  }

  function judgeSurvival(){
    surviveTimer = null;
    if (ctx.buildMode) return;                      // player already flipped back; nothing to judge
    const drift = window.__leanto.maxDrift || 0;
    const ridge1 = ridgeNow();
    let survived = null;                            // null = nothing was standing to test
    if (runRidge0 > RIDGE_MIN)
      survived = drift < SURVIVE_DRIFT && ridge1 >= runRidge0 * 0.5;
    m.lastRun = { survived, maxDrift: +drift.toFixed(4),
                  ridge0: +runRidge0.toFixed(4), ridge1: +ridge1.toFixed(4),
                  sticks: ctx.sticks.length };
    if (survived === true) m.runsSurvived++;
    else if (survived === false) m.runsCollapsed++;
    persist();
  }

  function rate(v){
    if (v !== 'up' && v !== 'down') return false;
    m.feelRating = v;
    m.feelRatedMs = m.readyMs != null ? Math.round(performance.now() - m.readyMs) : null;
    persist();
    return true;
  }

  // ---------- the one-tap rating (unobtrusive, serif, matches the resume prompt) ----------
  function showFeelPrompt(){
    feelPrompted = true;
    const el = document.createElement('div');
    el.style.cssText =
      'position:fixed;left:50%;bottom:84px;transform:translateX(-50%);z-index:11;' +
      'display:flex;align-items:center;gap:10px;' +
      'font:12.5px ui-serif,Georgia,serif;font-style:italic;color:#3a2e22;' +
      'background:rgba(247,240,229,.96);border:1px solid rgba(58,46,34,.18);' +
      'border-radius:8px;padding:6px 12px;box-shadow:0 6px 20px rgba(38,23,10,.14);' +
      'opacity:0;transition:opacity .5s;';
    const label = document.createElement('span');
    label.textContent = 'did it feel like you meant it?';
    el.appendChild(label);
    const mkBtn = (glyph, val) => {
      const b = document.createElement('button');
      b.textContent = glyph;
      b.setAttribute('aria-label', val === 'up' ? 'yes, it felt intentional' : 'no, it fought me');
      b.style.cssText = 'font-size:15px;line-height:1;cursor:pointer;background:none;' +
        'border:none;padding:2px 4px;border-radius:5px;filter:grayscale(.2);';
      b.addEventListener('mouseenter', () => { b.style.background = 'rgba(58,46,34,.12)'; });
      b.addEventListener('mouseleave', () => { b.style.background = 'none'; });
      b.addEventListener('click', () => { rate(val); dismiss(); });
      return b;
    };
    el.appendChild(mkBtn('👍', 'up'));
    el.appendChild(mkBtn('👎', 'down'));
    let gone = false;
    function dismiss(){
      if (gone) return; gone = true;
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 500);
    }
    document.body.appendChild(el);
    requestAnimationFrame(() => { el.style.opacity = '1'; });
    // it never nags: one appearance, and it fades on its own if ignored
    setTimeout(dismiss, 14000);
  }

  function snapshot(){
    return {
      startedAt: m.startedAt,
      timeToFirstGrabMs: m.timeToFirstGrabMs,
      grabs: m.grabs,
      placements: m.placements,
      regrabs: m.regrabs,
      corrections: m.corrections,
      runAttempts: m.runAttempts,
      runsSurvived: m.runsSurvived,
      runsCollapsed: m.runsCollapsed,
      lastRun: m.lastRun,
      feelRating: m.feelRating,
      feelRatedMs: m.feelRatedMs,
    };
  }

  // mount on the existing diagnostic surface (live object — inspectable in the console)
  window.__leanto.metrics = m;

  ctx.metrics = { onReady, onGrab, onRelease, onPlace, onRunReveal, onBuildReturn, rate, snapshot };
}
