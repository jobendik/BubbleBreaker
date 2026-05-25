import { State, type GameState } from '../constants';
import { Storage } from './storage';

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

// ============================================================================
// Asset loader
// ============================================================================
// Asset IDs are file paths under `public/sfx/` without extension. The loader
// probes .ogg → .mp3 → .wav and caches the first decoded buffer. Procedural
// fallback fires whenever the asset isn't loaded yet (first call always — the
// asset starts downloading and is ready for next time).

const SFX_EXTS = ['ogg', 'mp3', 'wav'] as const;
const SFX_BASE = `${import.meta.env.BASE_URL}sfx/`;

// Tier-S: preloaded on init(). Other IDs lazy-load on first use.
const TIER_S_PRELOAD: string[] = [
  // Base pops × 5 sizes × 3 variants — the core arcade feel
  'pop/base_size0_01', 'pop/base_size0_02', 'pop/base_size0_03',
  'pop/base_size1_01', 'pop/base_size1_02', 'pop/base_size1_03',
  'pop/base_size2_01', 'pop/base_size2_02', 'pop/base_size2_03',
  'pop/base_size3_01', 'pop/base_size3_02', 'pop/base_size3_03',
  'pop/base_size4_01', 'pop/base_size4_02', 'pop/base_size4_03',
  'pop/split_01', 'pop/split_02', 'pop/split_03',
  'pop/flourish_electric', 'pop/flourish_armored_shatter',
  'pop/flourish_lava', 'pop/flourish_sludge', 'pop/flourish_starbubble_clock',
  'weapon/harpoon_fire_01', 'weapon/harpoon_fire_02', 'weapon/harpoon_fire_03',
  'ui/nav_move', 'ui/nav_confirm', 'ui/button_hover',
  'stinger/player_dead', 'stinger/level_clear', 'stinger/timer_warning_10s',
  'combo/first_pop_celebration', 'combo/go_beat',
  'combo/milestone_5_nice', 'combo/milestone_10_wild',
  'boss/hit_weak_point', 'hazard/explosion_large',
  'pickup/generic_collect', 'pickup/shield_break',
];

const _buffers = new Map<string, AudioBuffer>();
const _loading = new Map<string, Promise<AudioBuffer | null>>();
const _failed = new Set<string>();
const _variantCounters = new Map<string, number>();

// ---------- Music ----------
// HTMLAudioElement instead of decoded AudioBuffer: streams from disk, loops
// natively, and avoids holding the full ~6 MB file in memory after decode.
// Trade-off: it's not routed through the master GainNode, so we manage mute/
// duck by directly pausing the element.
const MUSIC_VOL = 0.4;
const MUSIC_BASE = `${import.meta.env.BASE_URL}music/`;
let _musicEl: HTMLAudioElement | null = null;
let _musicCurrent: string | null = null;

const GAMEPLAY_MUSIC_STATES = new Set<GameState>([
  State.PLAYING,
  State.PLAYER_DEAD,
  State.LEVEL_CLEAR,
  State.GAME_OVER,
  State.BOSS_DEFEATED,
  State.VICTORY,
]);

function _loadOne(ctx: AudioContext, id: string): Promise<AudioBuffer | null> {
  const cached = _buffers.get(id);
  if (cached) return Promise.resolve(cached);
  if (_failed.has(id)) return Promise.resolve(null);
  const existing = _loading.get(id);
  if (existing) return existing;

  const p = (async () => {
    for (const ext of SFX_EXTS) {
      try {
        const res = await fetch(`${SFX_BASE}${id}.${ext}`);
        if (!res.ok) continue;
        const data = await res.arrayBuffer();
        const buf = await ctx.decodeAudioData(data);
        _buffers.set(id, buf);
        return buf;
      } catch { /* try next extension */ }
    }
    _failed.add(id);
    return null;
  })();
  _loading.set(id, p);
  return p;
}

// ============================ AUDIO =================================
/** Asset-first sound system with procedural Web Audio fallback so the game
 *  never goes silent if a file fails to load. Audio context is created lazily
 *  on first user interaction (browser policy). */
export const AudioSys = {
  ctx: null as AudioContext | null,
  master: null as GainNode | null,
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
    // Fire-and-forget Tier-S preload. Procedural fallback covers anything not ready.
    for (const id of TIER_S_PRELOAD) _loadOne(this.ctx, id);
    // Start the default menu loop. First user gesture (the same one that
    // unlocked the audio context above) lets the browser autoplay it.
    this.musicPlay('main_menu_music');
  },
  toggle() {
    this.muted = !this.muted;
    Storage.data.muted = this.muted;
    Storage.save();
    this._musicSync();
  },
  /** Suspend the audio context AND pause music so nothing leaks through an ad.
   *  CrazyGames rejects games that play audio over their ad slot. */
  duckForAd() {
    this.ducked = true;
    try { this.ctx?.suspend?.(); } catch { /* swallow */ }
    this._musicSync();
  },
  /** Restore audio after an ad finishes (success or error). */
  unduckForAd() {
    this.ducked = false;
    try { this.ctx?.resume?.(); } catch { /* swallow */ }
    this._musicSync();
  },

  /** Start (or switch to) a music loop. Idempotent for the same id. */
  musicPlay(id: string) {
    if (!_musicEl) {
      _musicEl = new Audio();
      _musicEl.loop = true;
      _musicEl.preload = 'auto';
      _musicEl.volume = MUSIC_VOL;
    }
    if (_musicCurrent !== id) {
      _musicCurrent = id;
      _musicEl.src = `${MUSIC_BASE}${id}.mp3`;
    }
    this._musicSync();
  },
  /** Route background music from the current game state.
   *  Pause owns its own loop; active gameplay states share the gameplay loop;
   *  everything else uses the main-menu loop. */
  syncMusicForState(state: GameState) {
    if (state === State.PAUSED) {
      this.musicPlay('pause_menu_music');
      return;
    }
    if (GAMEPLAY_MUSIC_STATES.has(state)) {
      this.musicPlay('game_music');
      return;
    }
    this.musicPlay('main_menu_music');
  },
  /** Reconcile music playback with current mute + duck state. Called from
   *  init/toggle/duck/unduck so the same gate covers every transition. */
  _musicSync() {
    if (!_musicEl || !_musicCurrent) return;
    const shouldPlay = !this.muted && !this.ducked;
    if (shouldPlay) {
      if (_musicEl.paused) _musicEl.play().catch(() => { /* needs user gesture, init will retry */ });
    } else {
      if (!_musicEl.paused) _musicEl.pause();
    }
  },

  /** Play a cached asset. Returns true if it played (caller skips procedural
   *  fallback); false if not loaded yet (caller plays procedural; asset starts
   *  downloading in the background and is ready for next call). */
  _playId(id: string, vol = 1): boolean {
    if (this.muted || !this.ctx || !this.master) return false;
    const buf = _buffers.get(id);
    if (!buf) {
      _loadOne(this.ctx, id);
      return false;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(g).connect(this.master);
    src.start();
    return true;
  },

  /** Round-robin variant pool: tries `${prefix}_01..03` and plays whichever is
   *  loaded next in rotation. Avoids the mechanical sameness of replaying one
   *  file during rapid clears. */
  _playVariant(prefix: string, vol = 1): boolean {
    if (this.muted || !this.ctx) return false;
    const c = _variantCounters.get(prefix) ?? 0;
    for (let i = 0; i < 3; i++) {
      const idx = ((c + i) % 3) + 1;
      const id = `${prefix}_${String(idx).padStart(2, '0')}`;
      if (_buffers.has(id)) {
        _variantCounters.set(prefix, c + 1);
        return this._playId(id, vol);
      }
    }
    for (let i = 1; i <= 3; i++) _loadOne(this.ctx, `${prefix}_${String(i).padStart(2, '0')}`);
    return false;
  },

  // ---------- Procedural primitives (kept as fallback) ----------
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

  // ---------- Game-event hooks (asset-first, procedural fallback) ----------
  shoot() {
    if (this._playVariant('weapon/harpoon_fire', 0.9)) return;
    this.beep(880, 0.06, 'square', 0.18, -400);
  },
  /** Pop sound — pitch drops as ball size increases for tactile size feedback.
   *  Optional `type` overlays a small typed flourish on top of the base pop:
   *    electric → high zap, lava → low sizzle (noise burst), smoke → soft whoosh,
   *    armored → metallic clank, bonus → chime, explosive → boom-tail.
   *  Variants are quieter than the base pop so the audio mix stays balanced and
   *  the dominant feedback is still the size-pitched core pop. */
  pop(size: number = 2, type: string = 'normal') {
    const s = Math.max(0, Math.min(4, size));
    const playedBase = this._playVariant(`pop/base_size${s}`, 1);
    if (!playedBase) {
      const lo = 760 - s * 90;        // 760, 670, 580, 490, 400
      const hi = lo + 220;
      this.beep(lo, 0.08 + s * 0.012, 'triangle', 0.28 + s * 0.035, -180 - s * 30);
      this.beep(hi, 0.05, 'sine', 0.14, 0);
    }
    switch (type) {
      case 'electric':
        if (!this._playId('pop/flourish_electric', 0.55)) {
          this.beep(2200, 0.06, 'square', 0.16, -1400);
        }
        break;
      case 'lava':
        if (!this._playId('pop/flourish_lava', 0.5)) {
          this.noise(0.18, 1200, 0.18);
          this.beep(180, 0.18, 'sawtooth', 0.18, -60);
        }
        break;
      case 'smoke':
        this.noise(0.22, 600, 0.16);
        break;
      case 'armored':
        if (!this._playId('pop/flourish_armored_shatter', 0.55)) {
          this.beep(1100, 0.05, 'square', 0.22, 0);
          this.beep(540, 0.04, 'square', 0.14, 0);
        }
        break;
      case 'bonus':
        if (!this._playId('combo/multipop_double', 0.55)) {
          this.beep(1320, 0.16, 'triangle', 0.22, 0);
          setTimeout(() => this.beep(1760, 0.18, 'triangle', 0.18, 0), 50);
        }
        break;
      case 'explosive':
        // Quick tail to bridge into the explode() call site without overlap.
        this.beep(120, 0.18, 'sawtooth', 0.22, -40);
        break;
      case 'sludge':
        if (!this._playId('pop/flourish_sludge', 0.55)) {
          this.noise(0.16, 350, 0.18);
        }
        break;
    }
  },
  split() {
    if (this._playVariant('pop/split', 0.7)) return;
    this.beep(380, 0.1, 'sawtooth', 0.2, 120);
  },
  /** Combo-milestone fanfare: short ascending arpeggio whose pitch rises with the
   *  milestone level (1 = first milestone). Procedurally synthesized, no assets. */
  comboHit(level: number) {
    const id = level <= 1 ? 'combo/milestone_5_nice'
      : level === 2 ? 'combo/milestone_10_wild'
      : level === 3 ? 'combo/milestone_15_insane'
      : 'combo/milestone_20_godlike';
    if (this._playId(id, 0.9)) return;
    const offset = (level - 1) * 80;
    const notes = [392 + offset, 523 + offset, 659 + offset, 784 + offset];
    notes.forEach((f, i) => setTimeout(() => this.beep(f, 0.1, 'triangle', 0.32), i * 55));
  },
  pickup() {
    if (this._playId('pickup/generic_collect', 0.85)) return;
    this.beep(660, 0.08, 'sine', 0.4, 300);
    this.beep(990, 0.1, 'sine', 0.3, 200);
  },
  shieldBreak() {
    if (this._playId('pickup/shield_break', 0.8)) return;
    this.beep(220, 0.2, 'sawtooth', 0.4, -100);
  },
  hurt() {
    if (this._playId('stinger/player_dead', 0.9)) return;
    this.beep(160, 0.35, 'sawtooth', 0.45, -120);
  },
  explode() {
    if (this._playId('hazard/explosion_large', 0.95)) return;
    this.noise(0.3, 600, 0.6);
    this.beep(120, 0.3, 'sawtooth', 0.4, -60);
  },
  bossHit() {
    if (this._playId('boss/hit_weak_point', 0.85)) return;
    this.beep(280, 0.1, 'square', 0.3, -100);
    this.beep(440, 0.08, 'square', 0.2, 0);
  },
  levelClear() {
    if (this._playId('stinger/level_clear', 0.9)) return;
    [523,659,784,1046].forEach((f,i)=>setTimeout(()=>this.beep(f,0.18,'triangle',0.4),i*80));
  },
  warning() {
    if (this._playId('stinger/timer_warning_10s', 0.6)) return;
    this.beep(880, 0.07, 'square', 0.25);
  },
  menu() {
    if (this._playId('ui/nav_move', 0.7)) return;
    this.beep(660, 0.06, 'square', 0.2);
  },
  /** Pointer entered a button — Tier-B subtle tick. Kept very quiet so a row
   *  of buttons swept by the cursor doesn't fatigue the ear. */
  hover() {
    if (this._playId('ui/button_hover', 0.35)) return;
    this.beep(1200, 0.02, 'sine', 0.06);
  },
  /** First-pop fanfare — a bigger, brighter, longer arpeggio than the combo
   *  one. Fires once per player, ever, on the very first ball they pop. */
  firstPop() {
    if (this._playId('combo/first_pop_celebration', 0.95)) return;
    const notes = [523, 659, 784, 1046, 1318];
    notes.forEach((f, i) => setTimeout(() => this.beep(f, 0.18, 'triangle', 0.4), i * 70));
  },
  /** GO! beat at level start — short rising two-note pulse, like a starting bell. */
  go() {
    if (this._playId('combo/go_beat', 0.85)) return;
    this.beep(660, 0.09, 'triangle', 0.35);
    setTimeout(() => this.beep(990, 0.13, 'triangle', 0.4), 70);
  },
};
