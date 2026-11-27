let audioCtx = null;

export function ensureAudio(soundEnabled) {
  if (!soundEnabled) return null;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!audioCtx) {
    audioCtx = new Ctx();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

export function playCallSound(num, soundEnabled) {
  if (!soundEnabled) return;
  const ctx = ensureAudio(soundEnabled);
  if (!ctx) return;

  const now = ctx.currentTime;
  const baseFreq = 440 + ((num - 1) % 15) * 18;

  const osc1 = ctx.createOscillator();
  const gain1 = ctx.createGain();
  osc1.type = "triangle";
  osc1.frequency.setValueAtTime(baseFreq, now);
  gain1.gain.setValueAtTime(0.001, now);
  gain1.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
  gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
  osc1.connect(gain1).connect(ctx.destination);
  osc1.start(now);
  osc1.stop(now + 0.25);

  const osc2 = ctx.createOscillator();
  const gain2 = ctx.createGain();
  osc2.type = "sine";
  osc2.frequency.setValueAtTime(baseFreq * 1.25, now + 0.11);
  gain2.gain.setValueAtTime(0.001, now + 0.11);
  gain2.gain.exponentialRampToValueAtTime(0.14, now + 0.13);
  gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.36);
  osc2.connect(gain2).connect(ctx.destination);
  osc2.start(now + 0.11);
  osc2.stop(now + 0.37);
}
