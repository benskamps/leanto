// Entry point. Lives in its own file (not an inline <script>) so the page runs
// under a strict Content-Security-Policy (script-src 'self'), as it does on
// brokenbranch.dev. three.js and Rapier are vendored under src/vendor/ for the
// same reason — see src/vendor/README.md.
window.__leanto = { ready:false, sticks:0, frames:0, physSteps:0, error:null, buildMode:true, glueMode:false, joints:0, metrics:null };
import('./main.js').then(m => m.boot()).catch(err => {
  window.__leanto.error = String(err && err.stack || err);
  document.getElementById('loading').style.display = 'none';
  const errEl = document.getElementById('err');
  errEl.style.display = 'block';
  errEl.textContent = 'leanto failed to start:\n' + window.__leanto.error;
});
