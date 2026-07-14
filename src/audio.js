// audio.js — the clatter, matured. Clack gain follows impact speed, pitch follows
// stick length (short pickets tick, long planks knock), everything through a gentle
// lowpass so a busy table stays warm instead of clicky. Plus: the glue squish, the
// unglue pop, the deny thunk, and the survival chime.

export function createAudio(ctx) {
  let audioCtx = null, lowpass = null, lastClack = 0;
  let muted = true;
  try { muted = localStorage.getItem('leanto.muted') !== '0'; } catch (_) {}

  function ac(){
    if (!audioCtx){
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      lowpass = audioCtx.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = 2400;
      lowpass.Q.value = 0.6;
      lowpass.connect(audioCtx.destination);
    }
    return audioCtx;
  }

  // strength 0..1 (impact speed), len in metres (pitch: short = high)
  function clack(strength, len){
    if (muted) return;
    const now = performance.now(); if (now - lastClack < 45) return; lastClack = now;
    const s = strength == null ? 0.5 : Math.min(1, Math.max(0.05, strength));
    const L = len || 0.114;
    try {
      const a = ac();
      const o = a.createOscillator(), g = a.createGain();
      o.type = 'triangle';
      o.frequency.value = (150 + (0.114 - L) * 1600) + Math.random()*90;   // pickets tick, planks knock
      const peak = 0.012 + 0.075 * s;
      g.gain.setValueAtTime(0.0001, a.currentTime);
      g.gain.exponentialRampToValueAtTime(peak, a.currentTime + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 0.06 + 0.05 * s);
      o.connect(g).connect(lowpass);
      o.start(); o.stop(a.currentTime + 0.13);
    } catch (_) {}
  }

  function squish(){                          // wet glue going on
    if (muted) return;
    try {
      const a = ac();
      const dur = 0.09;
      const buf = a.createBuffer(1, a.sampleRate * dur, a.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random()*2 - 1) * (1 - i/d.length);
      const src = a.createBufferSource(); src.buffer = buf;
      const f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 700; f.Q.value = 1.2;
      const g = a.createGain();
      g.gain.setValueAtTime(0.05, a.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
      src.connect(f).connect(g).connect(lowpass);
      src.start();
    } catch (_) {}
  }

  function pop(){                             // a bead letting go
    if (muted) return;
    try {
      const a = ac();
      const o = a.createOscillator(), g = a.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(520, a.currentTime);
      o.frequency.exponentialRampToValueAtTime(180, a.currentTime + 0.07);
      g.gain.setValueAtTime(0.0001, a.currentTime);
      g.gain.exponentialRampToValueAtTime(0.06, a.currentTime + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 0.09);
      o.connect(g).connect(lowpass);
      o.start(); o.stop(a.currentTime + 0.1);
    } catch (_) {}
  }

  function deny(){                            // low, short "nuh-uh" for rejected actions
    if (muted) return;
    try {
      const a = ac();
      const o = a.createOscillator(), g = a.createGain();
      o.type = 'square'; o.frequency.value = 82;
      g.gain.setValueAtTime(0.0001, a.currentTime);
      g.gain.exponentialRampToValueAtTime(0.03, a.currentTime + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 0.12);
      o.connect(g).connect(lowpass);
      o.start(); o.stop(a.currentTime + 0.14);
    } catch (_) {}
  }

  function chime(){                           // it stood! quiet two-note glow
    if (muted) return;
    try {
      const a = ac();
      [[523.25, 0], [783.99, 0.16]].forEach(([freq, at]) => {
        const o = a.createOscillator(), g = a.createGain();
        o.type = 'sine'; o.frequency.value = freq;
        g.gain.setValueAtTime(0.0001, a.currentTime + at);
        g.gain.exponentialRampToValueAtTime(0.045, a.currentTime + at + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + at + 1.1);
        o.connect(g).connect(lowpass);
        o.start(a.currentTime + at); o.stop(a.currentTime + at + 1.2);
      });
    } catch (_) {}
  }

  ctx.clack = clack;
  ctx.squish = squish;
  ctx.pop = pop;
  ctx.deny = deny;
  ctx.chime = chime;
  ctx.isMuted = () => muted;
  ctx.toggleMute = () => {
    muted = !muted;
    try { localStorage.setItem('leanto.muted', muted ? '1' : '0'); } catch (_) {}
    return muted;
  };
}
