// audio.js — the clatter. Tiny synth clack, rate-limited so piles don't buzz.

export function createAudio(ctx) {
  let audioCtx = null, muted = false, lastClack = 0;

  function clack(){
    if (muted) return;
    const now = performance.now(); if (now - lastClack < 55) return; lastClack = now;
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = 'triangle'; o.frequency.value = 170 + Math.random()*130;
      g.gain.setValueAtTime(0.0001, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.05, audioCtx.currentTime + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.085);
      o.connect(g).connect(audioCtx.destination);
      o.start(); o.stop(audioCtx.currentTime + 0.1);
    } catch (_) {}
  }

  ctx.clack = clack;
  ctx.toggleMute = () => { muted = !muted; };
}
