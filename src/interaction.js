// interaction.js — one explicit vocabulary for control state and command help.
// Input plumbing stays in main.js; this module owns the inspectable state and the
// registry consumed by the workbench UI, diagnostics, and tests.

export const COMMANDS = [
  { id:'move', label:'Move', hint:'drag the stick',
    bindings:{ mouse:'drag stick', touch:'drag stick', keyboard:'C selects · arrows move' } },
  { id:'orient', label:'Aim', hint:'drag either amber end',
    bindings:{ mouse:'drag an end', touch:'drag an end', keyboard:'R + arrows' } },
  { id:'lift', label:'Lift', hint:'drag the arrow above the stick',
    bindings:{ mouse:'drag ↑ or scroll while held', touch:'drag ↑', keyboard:'PageUp / PageDown' } },
  { id:'roll', label:'Roll', hint:'drag the small ring',
    bindings:{ mouse:'drag ring', touch:'drag ring', keyboard:'[ / ]' } },
  { id:'orbit', label:'Orbit camera', hint:'drag empty table',
    bindings:{ mouse:'drag empty table', touch:'drag empty table', keyboard:'1–4 views' } },
  { id:'pan', label:'Pan camera', hint:'shift-drag empty table',
    bindings:{ mouse:'shift-drag / middle-drag', touch:'two-finger drag', keyboard:'Shift + arrows' } },
  { id:'zoom', label:'Zoom', hint:'zoom toward the pointer',
    bindings:{ mouse:'scroll', touch:'pinch', keyboard:'+ / −' } },
  { id:'spawn', label:'Add stick', hint:'put another stick on the table',
    bindings:{ mouse:'+ Stick', touch:'+ Stick', keyboard:'Space' } },
  { id:'glue', label:'Glue', hint:'choose two touching sticks',
    bindings:{ mouse:'Glue, then two sticks', touch:'Glue, then two sticks', keyboard:'G' } },
  { id:'snip', label:'Snip', hint:'choose where to cut',
    bindings:{ mouse:'Snip, then a stick', touch:'Snip, then a stick', keyboard:'S' } },
  { id:'stamp', label:'Duplicate', hint:'copy the last stick here',
    bindings:{ mouse:'Duplicate', touch:'Duplicate', keyboard:'D' } },
  { id:'reveal', label:'BUILD / RUN', hint:'let gravity answer',
    bindings:{ mouse:'BUILD / RUN', touch:'BUILD / RUN', keyboard:'B' } },
  { id:'undo', label:'Undo', hint:'take back the last build action',
    bindings:{ mouse:'Undo', touch:'Undo', keyboard:'Ctrl / Cmd + Z' } },
  { id:'redo', label:'Redo', hint:'bring back what undo took',
    bindings:{ mouse:'Redo', touch:'Redo', keyboard:'Ctrl / Cmd + Y' } },
  { id:'remove', label:'Delete', hint:'remove the selected stick',
    bindings:{ mouse:'select, then Delete', touch:'select, then Delete', keyboard:'Delete' } },
  { id:'sound', label:'Sound', hint:'turn the workshop sounds on or off',
    bindings:{ mouse:'sound button', touch:'sound button', keyboard:'M' } },
  { id:'cancel', label:'Cancel', hint:'return to the captured starting pose',
    bindings:{ mouse:'secondary click', touch:'two-finger tap', keyboard:'Escape' } },
];

export function createInteraction(ctx) {
  const state = {
    world: 'build',
    tool: 'hand',
    selection: { ids: [], primary: null },
    gesture: 'idle',
    target: null,
    device: matchMedia('(pointer:coarse)').matches ? 'touch' : 'mouse',
  };
  const listeners = new Set();
  const snapshot = () => ({
    ...state,
    selection: { ids: state.selection.ids.slice(), primary: state.selection.primary },
  });
  function emit(){
    const next = snapshot();
    window.__leanto.interaction = next;
    for (const fn of listeners) fn(next);
  }
  function patch(next){ Object.assign(state, next); emit(); }
  function select(id){
    state.selection.ids = id == null ? [] : [id];
    state.selection.primary = id == null ? null : id;
    emit();
  }
  function beginGesture(gesture, target, device){
    state.gesture = gesture;
    state.target = target || null;
    if (device) state.device = device;
    emit();
  }
  function endGesture(){ state.gesture = 'idle'; state.target = null; emit(); }
  function subscribe(fn){ listeners.add(fn); fn(snapshot()); return () => listeners.delete(fn); }

  const api = {
    state, commands: COMMANDS, snapshot, subscribe, patch, select, beginGesture, endGesture,
    setWorld: world => patch({ world }),
    setTool: tool => patch({ tool }),
  };
  ctx.interaction = api;
  emit();
  return api;
}
