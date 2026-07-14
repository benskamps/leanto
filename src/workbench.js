// workbench.js — restrained DOM chrome around the full-canvas craft table.
// State comes from interaction.js; actions are injected by main after its input
// functions exist, keeping the UI independent of physics and placement details.

export function createWorkbench(ctx) {
  const q = id => document.getElementById(id);
  const els = {
    root:q('workbench'), mode:q('mode-toggle'), modeLabel:q('mode-label'),
    hint:q('context-hint'), status:q('status'), help:q('help-panel'),
    helpOpen:q('help-open'), helpClose:q('help-close'), helpList:q('help-list'),
    undo:q('undo-button'), sound:q('sound-toggle'), add:q('add-stick'), cottage:q('load-cottage'),
    toolButtons:[...document.querySelectorAll('[data-tool]')],
  };
  let actions = {};
  const run = name => (...args) => { if (actions[name]) actions[name](...args); };
  els.mode.addEventListener('click', run('toggleMode'));
  els.undo.addEventListener('click', run('undo'));
  els.sound.addEventListener('click', run('toggleSound'));
  els.add.addEventListener('click', run('addStick'));
  els.cottage.addEventListener('click', run('loadCottage'));
  for (const b of els.toolButtons) b.addEventListener('click', () => run('setTool')(b.dataset.tool));

  function setHelp(on){
    els.help.hidden = !on; els.helpOpen.setAttribute('aria-expanded', on ? 'true' : 'false');
    if (on) els.helpClose.focus(); else els.helpOpen.focus();
  }
  els.helpOpen.addEventListener('click', () => setHelp(true));
  els.helpClose.addEventListener('click', () => setHelp(false));
  els.help.addEventListener('click', e => { if (e.target === els.help) setHelp(false); });
  addEventListener('keydown', e => {
    if (e.key === 'Escape' && !els.help.hidden){ e.preventDefault(); e.stopImmediatePropagation(); setHelp(false); return; }
    if (e.key === '?' && !e.ctrlKey && !e.metaKey) setHelp(true);
  });

  for (const command of ctx.interaction.commands) {
    const row = document.createElement('li');
    const binding = command.bindings[ctx.interaction.state.device] || command.bindings.mouse;
    row.innerHTML = `<span>${command.label}</span><kbd>${binding}</kbd>`;
    els.helpList.appendChild(row);
  }

  function hintFor(s){
    if (s.world === 'run') return s.gesture === 'idle' ? 'Gravity is answering.' : 'Release to let go.';
    if (s.tool === 'glue') return 'Choose two touching sticks.';
    if (s.tool === 'snip') return 'Choose a cut on one stick.';
    if (s.tool === 'stamp') return 'Move the pointer, then duplicate.';
    if (s.gesture === 'orient') return 'Aim the free end.';
    if (s.gesture === 'lift') return 'Raise it; the ghost remembers the table.';
    if (s.gesture === 'roll') return 'Roll around the stick.';
    if (s.gesture === 'move') return 'Place it where your hand intends.';
    if (s.selection.primary != null) return 'Drag an amber end to lean it. Arrow lifts; ring rolls.';
    return 'Drag a stick.';
  }
  ctx.interaction.subscribe(s => {
    const build = s.world === 'build';
    els.root.dataset.world = s.world; els.root.dataset.tool = s.tool;
    els.mode.setAttribute('aria-pressed', build ? 'false' : 'true');
    els.modeLabel.textContent = build ? 'BUILD' : 'RUN';
    els.mode.querySelector('.mode-next').textContent = build ? 'RUN it' : 'Freeze';
    els.hint.textContent = hintFor(s);
    for (const b of els.toolButtons) {
      const active = b.dataset.tool === s.tool;
      b.classList.toggle('active', active); b.setAttribute('aria-pressed', active ? 'true' : 'false');
      b.disabled = !build && b.dataset.tool !== 'hand';
    }
    els.add.disabled = false; els.undo.disabled = !build;
  });

  function bind(next){ actions = next || {}; }
  function setStatus(text){ els.status.textContent = text; }
  function setMuted(muted){
    els.sound.textContent = muted ? '♩' : '♪';
    els.sound.setAttribute('aria-pressed', muted ? 'true' : 'false');
    els.sound.setAttribute('aria-label', muted ? 'Turn sound on' : 'Mute sound');
    els.sound.title = muted ? 'Sound is off' : 'Sound is on';
  }
  function hide(on){ els.root.hidden = !!on; }
  return { bind, setStatus, setMuted, setHelp, hide, els };
}
