import { Storage } from './storage';

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

// ============================ AUDIO =================================
/** Procedural sound effects via Web Audio API. No external files.
 *  Audio context is created lazily on first user interaction (browser policy). */
export const AudioSys = {
  ctx: null,
  master: null,
  muted: false,
  /** Transient duck flag set when an ad is playing. Independent from `muted`
   *  (the user's persisted preference) so the user's mute state is restored
   *  cleanly when the ad finishes. CrazyGames requires the game to be silent
   *  while ad audio plays — failing to do so is a top rejection cause. */
  ducked: false,
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.35;
    this.master.connect(this.ctx.destination);
  },
  toggle() {
    this.muted = !this.muted;
    Storage.data.muted = this.muted;
    Storage.save();
  },
  /** Suspend the audio context so no game audio leaks through an ad. */
  duckForAd() {
    this.ducked = true;
    try { this.ctx?.suspend?.(); } catch { /* swallow */ }
  },
  /** Restore audio after an ad finishes (success or error). */
  unduckForAd() {
    this.ducked = false;
    try { this.ctx?.resume?.(); } catch { /* swallow */ }
  },
  /** Generic envelope tone */
  beep(freq, dur, type = 'square', vol = 0.4, slide = 0) {
    if (this.muted || !this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + dur);
  },
  /** Noise burst for explosions, etc. */
  noise(dur, freq, vol = 0.3) {
    if (this.muted || !this.ctx) return;
    const t = this.ctx.currentTime;
    const bufSize = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufSize);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t);
  },
  shoot()      { this.beep(880, 0.06, 'square', 0.18, -400); },
  /** Pop sound — pitch drops as ball size increases for tactile size feedback.
   *  Optional `type` overlays a small typed flourish on top of the base pop:
   *    electric → high zap, lava → low sizzle (noise burst), smoke → soft whoosh,
   *    armored → metallic clank, bonus → chime, explosive → boom-tail.
   *  Variants are quieter than the base pop so the audio mix stays balanced and
   *  the dominant feedback is still the size-pitched core pop. */
  pop(size: number = 2, type: string = 'normal') {
    const s = Math.max(0, Math.min(4, size));
    const lo = 760 - s * 90;        // 760, 670, 580, 490, 400
    const hi = lo + 220;
    this.beep(lo, 0.08 + s * 0.012, 'triangle', 0.28 + s * 0.035, -180 - s * 30);
    this.beep(hi, 0.05, 'sine', 0.14, 0);
    switch (type) {
      case 'electric':
        this.beep(2200, 0.06, 'square', 0.16, -1400);
        break;
      case 'lava':
        this.noise(0.18, 1200, 0.18);
        this.beep(180, 0.18, 'sawtooth', 0.18, -60);
        break;
      case 'smoke':
        this.noise(0.22, 600, 0.16);
        break;
      case 'armored':
        this.beep(1100, 0.05, 'square', 0.22, 0);
        this.beep(540, 0.04, 'square', 0.14, 0);
        break;
      case 'bonus':
        // Bright bell-like chime: two near-octave triangles for a sparkle.
        this.beep(1320, 0.16, 'triangle', 0.22, 0);
        setTimeout(() => this.beep(1760, 0.18, 'triangle', 0.18, 0), 50);
        break;
      case 'explosive':
        // Quick tail to bridge into the explode() call site without overlap.
        this.beep(120, 0.18, 'sawtooth', 0.22, -40);
        break;
      case 'sludge':
        this.noise(0.16, 350, 0.18);
        break;
    }
  },
  split()      { this.beep(380, 0.1, 'sawtooth', 0.2, 120); },
  /** Combo-milestone fanfare: short ascending arpeggio whose pitch rises with the
   *  milestone level (1 = first milestone). Procedurally synthesized, no assets. */
  comboHit(level: number) {
    const offset = (level - 1) * 80;
    const notes = [392 + offset, 523 + offset, 659 + offset, 784 + offset];
    notes.forEach((f, i) => setTimeout(() => this.beep(f, 0.1, 'triangle', 0.32), i * 55));
  },
  pickup()     { this.beep(660, 0.08, 'sine', 0.4, 300); this.beep(990, 0.1, 'sine', 0.3, 200); },
  shieldBreak(){ this.beep(220, 0.2, 'sawtooth', 0.4, -100); },
  hurt()       { this.beep(160, 0.35, 'sawtooth', 0.45, -120); },
  explode()    { this.noise(0.3, 600, 0.6); this.beep(120, 0.3, 'sawtooth', 0.4, -60); },
  bossHit()    { this.beep(280, 0.1, 'square', 0.3, -100); this.beep(440, 0.08, 'square', 0.2, 0); },
  levelClear() { [523,659,784,1046].forEach((f,i)=>setTimeout(()=>this.beep(f,0.18,'triangle',0.4),i*80)); },
  warning()    { this.beep(880, 0.07, 'square', 0.25); },
  menu()       { this.beep(660, 0.06, 'square', 0.2); },
  /** First-pop fanfare — a bigger, brighter, longer arpeggio than the combo
   *  one. Fires once per player, ever, on the very first ball they pop. */
  firstPop() {
    const notes = [523, 659, 784, 1046, 1318];
    notes.forEach((f, i) => setTimeout(() => this.beep(f, 0.18, 'triangle', 0.4), i * 70));
  },
  /** GO! beat at level start — short rising two-note pulse, like a starting bell. */
  go() {
    this.beep(660, 0.09, 'triangle', 0.35);
    setTimeout(() => this.beep(990, 0.13, 'triangle', 0.4), 70);
  },
};
