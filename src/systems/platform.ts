/**
 * CrazyGames platform adapter.
 *
 * Two responsibilities:
 *   1. Bridge the in-game state machine to the CrazyGames SDK (gameplay
 *      events, happy time, loading events, ad requests, game context,
 *      cloud save via the Data Module).
 *   2. Degrade gracefully when the SDK is absent — local dev, offline, or
 *      a player with an aggressive adblocker. In that case every method
 *      becomes a no-op that resolves immediately so the game still works.
 *
 * Nothing else in the codebase should reference `window.CrazyGames` directly.
 */

type AdType = 'midgame' | 'rewarded';
interface AdCallbacks {
  adStarted?: () => void;
  adFinished?: () => void;
  adError?: (err: unknown) => void;
}

interface CrazyGamesUser {
  username?: string;
  profilePictureUrl?: string;
}

interface CrazyGamesSDK {
  init(): Promise<void>;
  game?: {
    gameplayStart?(): void;
    gameplayStop?(): void;
    happytime?(): void;
    loadingStart?(): void;
    loadingStop?(): void;
    setGameContext?(ctx: Record<string, unknown>): void;
  };
  ad?: {
    requestAd?(type: AdType, callbacks?: AdCallbacks): void;
    hasAdblock?(): Promise<boolean>;
  };
  data?: {
    getItem?(key: string): Promise<string | null> | string | null;
    setItem?(key: string, value: string): Promise<void> | void;
    removeItem?(key: string): Promise<void> | void;
  };
  user?: {
    getUser?(): Promise<CrazyGamesUser | null> | CrazyGamesUser | null;
    isUserAccountAvailable?(): boolean;
    submitScore?(payload: { encryptedScore: string; score: number }): Promise<void> | void;
  };
}

declare global {
  interface Window {
    CrazyGames?: { SDK?: CrazyGamesSDK };
  }
}

function getSDK(): CrazyGamesSDK | null {
  if (typeof window === 'undefined') return null;
  const sdk = window.CrazyGames?.SDK;
  return sdk || null;
}

/** Safely access an SDK submodule. The CrazyGames SDK throws synchronously
 *  from `sdk.game`, `sdk.ad`, `sdk.data`, `sdk.user` getters if `init()`
 *  hasn't completed ("CrazySDK is not initialized yet"). Every wrapper below
 *  routes through this so the game can never crash from an SDK property
 *  access throw. */
function safeGet<K extends 'game' | 'ad' | 'data' | 'user'>(name: K): CrazyGamesSDK[K] | null {
  const sdk = getSDK();
  if (!sdk) return null;
  try { return sdk[name] ?? null; } catch { return null; }
}

/** Per-session ad pacing. CrazyGames itself enforces minimum spacing, but we
 *  add a safety floor so we never spam requests during rapid level cycling. */
const MIDGAME_MIN_INTERVAL_MS = 60_000;
let lastMidgameAdAt = 0;
const LEADERBOARD_KEY = (import.meta.env.VITE_CG_LEADERBOARD_KEY || '').trim();

// Optional listener the game registers so it can pause + mute on ad start and
// resume + unmute on ad end. Kept decoupled so platform.ts doesn't reach into
// game state directly. main.ts wires this on boot.
type AdLifecycleHook = (event: 'start' | 'end') => void;
let adLifecycleHook: AdLifecycleHook | null = null;

export const Platform = {
  ready: false,
  hasSDK: false,
  adsBlocked: false,

  /** Boot — call once at startup. Resolves whether or not the SDK is present. */
  async init(): Promise<void> {
    const sdk = getSDK();
    if (!sdk) {
      this.ready = true;
      this.hasSDK = false;
      return;
    }
    try {
      await sdk.init();
      this.hasSDK = true;
      // Best-effort adblock detection — purely informational. The `ad` getter
      // can still throw briefly during init handoff, so route through safeGet.
      const ad = safeGet('ad');
      if (ad?.hasAdblock) {
        try { this.adsBlocked = await ad.hasAdblock(); } catch { /* ignore */ }
      }
    } catch (err) {
      // SDK present but init failed: still safe, just no platform features.
      // eslint-disable-next-line no-console
      console.warn('[Platform] CrazyGames SDK init failed:', err);
      this.hasSDK = false;
    }
    this.ready = true;
  },

  /** Signal "the engine is now decoding assets / setting up the first scene."
   *  CrazyGames uses this to measure load time and gates the loading screen.
   *  Safe to call before init() — silently no-ops if the SDK isn't ready. */
  loadingStart(): void {
    if (!this.ready) return;
    const g = safeGet('game');
    try { g?.loadingStart?.(); } catch { /* never throw */ }
  },

  /** Signal "loading is complete; the player can interact." */
  loadingStop(): void {
    if (!this.ready) return;
    const g = safeGet('game');
    try { g?.loadingStop?.(); } catch { /* never throw */ }
  },

  /** Attach contextual hints (current level, mode, modifier) so the in-iframe
   *  feedback widget can show which moment of the game the player was in when
   *  they submitted a report. Always safe to call. */
  setGameContext(ctx: Record<string, unknown>): void {
    if (!this.ready) return;
    const g = safeGet('game');
    try { g?.setGameContext?.(ctx); } catch { /* swallow */ }
  },

  /** Player has just entered active gameplay. Mutes ads during the run. */
  gameplayStart(): void {
    if (!this.ready) return;
    const g = safeGet('game');
    try { g?.gameplayStart?.(); } catch { /* never throw to the game */ }
  },

  /** Player has just left active gameplay. Allows ad pre-roll, etc. */
  gameplayStop(): void {
    if (!this.ready) return;
    const g = safeGet('game');
    try { g?.gameplayStop?.(); } catch { /* swallow */ }
  },

  /** Signal a moment of player satisfaction (level clear, boss defeat, PB). */
  happytime(): void {
    if (!this.ready) return;
    const g = safeGet('game');
    try { g?.happytime?.(); } catch { /* swallow */ }
  },

  /** Register a hook called with 'start' when an ad begins and 'end' when it
   *  finishes (success OR error). The game uses this to pause + mute. Calling
   *  again replaces the previous hook. Passing null clears it. */
  setAdLifecycleHook(hook: AdLifecycleHook | null): void {
    adLifecycleHook = hook;
  },

  /**
   * Request a midgame ad. Resolves when the ad completes, errors out, or is
   * skipped due to pacing / no SDK. Always resolves — never rejects.
   */
  requestMidgameAd(): Promise<void> {
    const now = Date.now();
    if (now - lastMidgameAdAt < MIDGAME_MIN_INTERVAL_MS) return Promise.resolve();
    const ad = safeGet('ad');
    if (!ad?.requestAd) return Promise.resolve();
    lastMidgameAdAt = now;
    return new Promise<void>(resolve => {
      // 10-second hard timeout: if the SDK never fires a callback for any
      // reason (network hang, broken ad), we proceed rather than freeze.
      let settled = false;
      let started = false;
      const end = () => { if (started) { try { adLifecycleHook?.('end'); } catch {} } };
      const settle = () => { if (!settled) { settled = true; end(); resolve(); } };
      const timeout = window.setTimeout(settle, 10_000);
      try {
        ad.requestAd!('midgame', {
          adStarted:  () => { started = true; try { adLifecycleHook?.('start'); } catch {} },
          adFinished: () => { window.clearTimeout(timeout); settle(); },
          adError:    () => { window.clearTimeout(timeout); settle(); },
        });
      } catch {
        window.clearTimeout(timeout);
        settle();
      }
    });
  },

  /**
   * Request a rewarded ad. Resolves to true if the reward should be granted
   * (ad completed). Resolves to false on error, no SDK, or user-aborted.
   */
  requestRewardedAd(): Promise<boolean> {
    const ad = safeGet('ad');
    if (!ad?.requestAd) return Promise.resolve(false);
    return new Promise<boolean>(resolve => {
      let settled = false;
      let started = false;
      const end = () => { if (started) { try { adLifecycleHook?.('end'); } catch {} } };
      const settle = (granted: boolean) => { if (!settled) { settled = true; end(); resolve(granted); } };
      const timeout = window.setTimeout(() => settle(false), 30_000);
      try {
        ad.requestAd!('rewarded', {
          adStarted:  () => { started = true; try { adLifecycleHook?.('start'); } catch {} },
          adFinished: () => { window.clearTimeout(timeout); settle(true); },
          adError:    () => { window.clearTimeout(timeout); settle(false); },
        });
      } catch {
        window.clearTimeout(timeout);
        settle(false);
      }
    });
  },

  /** Best-effort lookup of the logged-in CrazyGames player. Resolves to
   *  null for guests, no-SDK, or any error. The returned username can be
   *  surfaced in greetings ("Welcome back, {name}") to make returning
   *  players feel recognized. */
  async getUsername(): Promise<string | null> {
    if (!this.ready) return null;
    const u = safeGet('user');
    if (!u?.getUser) return null;
    try {
      const result = u.getUser();
      const user = result instanceof Promise ? await result : result;
      const name = user?.username?.trim();
      return name ? name : null;
    } catch {
      return null;
    }
  },

  /** Submit a score to CrazyGames' single game leaderboard. The feature is
   *  invite-only on the platform and requires VITE_CG_LEADERBOARD_KEY to be
   *  configured. When unavailable, this is a silent no-op so the same build
   *  works for Basic Launch and local development. */
  async submitLeaderboardScore(score: number): Promise<boolean> {
    if (!this.ready || !this.hasSDK || !LEADERBOARD_KEY) return false;
    if (!Number.isFinite(score) || score <= 0) return false;
    const u = safeGet('user');
    if (!u?.submitScore) return false;
    try {
      const encryptedScore = await encryptScore(score, LEADERBOARD_KEY);
      await u.submitScore({ encryptedScore, score });
      return true;
    } catch {
      return false;
    }
  },

  /** Cloud save (best-effort). Always resolves. */
  async save(key: string, data: string): Promise<void> {
    const d = safeGet('data');
    if (!d?.setItem) return;
    try { await d.setItem(key, data); } catch { /* swallow */ }
  },

  /** Cloud load. Returns null if no SDK, no entry, or any error. Tolerates
   *  both sync and async Data Module implementations. */
  async load(key: string): Promise<string | null> {
    const d = safeGet('data');
    if (!d?.getItem) return null;
    try {
      const result = d.getItem(key);
      return result instanceof Promise ? await result : result;
    } catch {
      return null;
    }
  },
};

async function encryptScore(score: number, encryptionKey: string): Promise<string> {
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const keyBytes = Uint8Array.from(atob(encryptionKey), c => c.charCodeAt(0));
  const cryptoKey = await window.crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt']);
  const dataBuffer = new TextEncoder().encode(String(score));
  const encrypted = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, dataBuffer);
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);
  let out = '';
  for (let i = 0; i < combined.length; i++) out += String.fromCharCode(combined[i]);
  return btoa(out);
}
