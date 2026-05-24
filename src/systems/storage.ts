import { Platform as Sdk } from './platform';

export type MedalTier = 0 | 1 | 2 | 3;     // 0 = none, 1 = bronze, 2 = silver, 3 = gold

export interface SaveData {
  schemaVersion: 2;
  bestTour: Record<string, number>;
  bestScoreAttack: number;
  bestPanicWave: number;
  bestPanicScore: number;
  muted: boolean;
  unlockedLevel: number;
  // Added in v2 ↓
  medals: Record<string, MedalTier>;
  dailyLastPlayed: string;          // 'YYYY-MM-DD' (UTC) of the last day the daily was attempted
  dailyStreak: number;              // consecutive UTC days the player has attempted the daily
  dailyBest: Record<string, number>;// 'YYYY-MM-DD' -> best score on that day
  reducedMotion: boolean;           // accessibility: skip screen shake and white flash
  lastSessionDate: string;          // 'YYYY-MM-DD' (UTC) — used to drive the welcome-back banner
  firstPopCelebrated: boolean;      // one-time "FIRST POP!" celebration has fired for this player
  lifetimeMaxCombo: number;         // highest combo ever reached, for the Combo Crusher title
  lifetimePops: number;             // every ball popped ever — drives the Marksman title
  bestMultiPop: number;             // largest single multi-pop chain ever — drives Detonator
  lifetimeTricks: number;           // CLUTCH/AIR/CLOSE/BANK shots accumulated — drives Trickster
  lifetimePlayMs: number;           // cumulative time spent in the PLAYING state, ms
  /** Comma-joined ids of titles we have already shown the unlock toast for.
   *  Prevents re-firing the toast on every session for titles already known. */
  seenTitleIds: string;
}

const KEY_V1 = 'bba_save_v1';
const KEY_V2 = 'bba_save_v2';

function createDefaultSave(): SaveData {
  return {
    schemaVersion: 2,
    bestTour: {},
    bestScoreAttack: 0,
    bestPanicWave: 0,
    bestPanicScore: 0,
    muted: false,
    unlockedLevel: 0,
    medals: {},
    dailyLastPlayed: '',
    dailyStreak: 0,
    dailyBest: {},
    reducedMotion: false,
    lastSessionDate: '',
    firstPopCelebrated: false,
    lifetimeMaxCombo: 0,
    lifetimePops: 0,
    bestMultiPop: 0,
    lifetimeTricks: 0,
    lifetimePlayMs: 0,
    seenTitleIds: '',
  };
}

function migrateFromV1(raw: string): SaveData {
  const out = createDefaultSave();
  try {
    const v1 = JSON.parse(raw);
    if (v1 && typeof v1 === 'object') {
      if (v1.bestTour && typeof v1.bestTour === 'object') out.bestTour = v1.bestTour;
      if (typeof v1.bestScoreAttack === 'number') out.bestScoreAttack = v1.bestScoreAttack;
      if (typeof v1.bestPanicWave === 'number')   out.bestPanicWave   = v1.bestPanicWave;
      if (typeof v1.bestPanicScore === 'number')  out.bestPanicScore  = v1.bestPanicScore;
      if (typeof v1.muted === 'boolean')          out.muted           = v1.muted;
      if (typeof v1.unlockedLevel === 'number')   out.unlockedLevel   = v1.unlockedLevel;
    }
  } catch { /* corrupt v1: fall back to defaults */ }
  return out;
}

/**
 * Merge a cloud snapshot into the local save, preferring the higher value for
 * each progress field so the merge can never erase progress made offline. Used
 * after the SDK Data Module returns a cloud save asynchronously.
 */
function mergeProgress(local: SaveData, cloud: Partial<SaveData>): SaveData {
  const out: SaveData = { ...local };
  if (cloud.unlockedLevel != null)   out.unlockedLevel   = Math.max(local.unlockedLevel,   cloud.unlockedLevel);
  if (cloud.bestScoreAttack != null) out.bestScoreAttack = Math.max(local.bestScoreAttack, cloud.bestScoreAttack);
  if (cloud.bestPanicWave != null)   out.bestPanicWave   = Math.max(local.bestPanicWave,   cloud.bestPanicWave);
  if (cloud.bestPanicScore != null)  out.bestPanicScore  = Math.max(local.bestPanicScore,  cloud.bestPanicScore);
  if (cloud.lifetimeMaxCombo != null) out.lifetimeMaxCombo = Math.max(local.lifetimeMaxCombo || 0, cloud.lifetimeMaxCombo);
  if (cloud.lifetimePops != null)    out.lifetimePops    = Math.max(local.lifetimePops || 0,    cloud.lifetimePops);
  if (cloud.bestMultiPop != null)    out.bestMultiPop    = Math.max(local.bestMultiPop || 0,    cloud.bestMultiPop);
  if (cloud.lifetimeTricks != null)  out.lifetimeTricks  = Math.max(local.lifetimeTricks || 0,  cloud.lifetimeTricks);
  if (cloud.lifetimePlayMs != null)  out.lifetimePlayMs  = Math.max(local.lifetimePlayMs || 0,  cloud.lifetimePlayMs);
  // Title-seen set: union, so the unlock toast doesn't re-fire on a new device
  // for titles the player has already seen elsewhere.
  if (cloud.seenTitleIds) {
    const merged = new Set((local.seenTitleIds || '').split(',').filter(Boolean));
    for (const id of cloud.seenTitleIds.split(',').filter(Boolean)) merged.add(id);
    out.seenTitleIds = Array.from(merged).join(',');
  }
  if (cloud.dailyStreak != null)     out.dailyStreak     = Math.max(local.dailyStreak,     cloud.dailyStreak);
  // Last-played: take the later date.
  if (cloud.dailyLastPlayed && cloud.dailyLastPlayed > local.dailyLastPlayed) out.dailyLastPlayed = cloud.dailyLastPlayed;
  if (cloud.lastSessionDate && cloud.lastSessionDate > local.lastSessionDate) out.lastSessionDate = cloud.lastSessionDate;
  // Per-level bests: keep the max for each entry; union of keys.
  if (cloud.bestTour) {
    const merged = { ...local.bestTour };
    for (const k in cloud.bestTour) merged[k] = Math.max(merged[k] || 0, cloud.bestTour[k]);
    out.bestTour = merged;
  }
  if (cloud.medals) {
    const merged = { ...local.medals };
    for (const k in cloud.medals) {
      const cv = cloud.medals[k] as MedalTier;
      const lv = (merged[k] as MedalTier) || 0;
      merged[k] = (cv > lv ? cv : lv) as MedalTier;
    }
    out.medals = merged;
  }
  if (cloud.dailyBest) {
    const merged = { ...local.dailyBest };
    for (const k in cloud.dailyBest) merged[k] = Math.max(merged[k] || 0, cloud.dailyBest[k]);
    out.dailyBest = merged;
  }
  // Sticky one-time flags: if either side has fired the celebration, keep it.
  if (cloud.firstPopCelebrated) out.firstPopCelebrated = true;
  // Settings (muted, reducedMotion) — prefer the cloud copy if it exists, since
  // it represents the player's most recent device preference.
  if (typeof cloud.muted === 'boolean')         out.muted         = cloud.muted;
  if (typeof cloud.reducedMotion === 'boolean') out.reducedMotion = cloud.reducedMotion;
  return out;
}

// Debounced cloud write — coalesces save bursts (e.g. several Storage.save()
// calls during a single level-clear) into one network call. The Data Module
// itself rate-limits, so this is purely a polite-citizen optimization.
let cloudWriteTimer: number | null = null;
function scheduleCloudWrite(payload: string) {
  if (typeof window === 'undefined') return;
  if (cloudWriteTimer != null) window.clearTimeout(cloudWriteTimer);
  cloudWriteTimer = window.setTimeout(() => {
    cloudWriteTimer = null;
    Sdk.save(KEY_V2, payload).catch(() => { /* swallow — local copy is canonical */ });
  }, 1200);
}

// ============================ STORAGE ===============================
// Versioned schema with graceful migration. Two-tier persistence:
//   1. localStorage   — synchronous, always written, the source of truth at boot.
//   2. CrazyGames Data Module — best-effort, asynchronous, gives cross-device
//      sync for logged-in CrazyGames users. Merged in after boot when ready.
export const Storage: {
  data: SaveData;
  load: () => SaveData;
  save: () => void;
  hydrateCloud: () => Promise<{ merged: boolean }>;
} = {
  data: createDefaultSave(),
  load() {
    try {
      const rawV2 = localStorage.getItem(KEY_V2);
      if (rawV2) {
        const parsed = JSON.parse(rawV2);
        this.data = { ...createDefaultSave(), ...(parsed || {}) };
        // Defensive: nested objects need to be present even after partial saves.
        if (!this.data.bestTour)  this.data.bestTour  = {};
        if (!this.data.medals)    this.data.medals    = {};
        if (!this.data.dailyBest) this.data.dailyBest = {};
        return this.data;
      }
      const rawV1 = localStorage.getItem(KEY_V1);
      if (rawV1) {
        this.data = migrateFromV1(rawV1);
        // Persist immediately so v1 readers don't run forever.
        this.save();
        return this.data;
      }
    } catch { /* localStorage unavailable: use defaults */ }
    this.data = createDefaultSave();
    return this.data;
  },
  save() {
    const payload = JSON.stringify(this.data);
    try { localStorage.setItem(KEY_V2, payload); } catch { /* ignore */ }
    // Mirror to the cloud (best-effort, debounced). The local copy is still
    // canonical — cloud write failures must never affect gameplay.
    scheduleCloudWrite(payload);
  },
  /** Pull any cloud save and merge it into the local copy. Returns whether a
   *  meaningful merge happened (caller can re-render menus etc). Always safe —
   *  resolves false on no-SDK, no-cloud-entry, parse failure, or no progress. */
  async hydrateCloud() {
    try {
      const raw = await Sdk.load(KEY_V2);
      if (!raw) return { merged: false };
      const cloud = JSON.parse(raw) as Partial<SaveData>;
      const before = JSON.stringify(this.data);
      this.data = mergeProgress(this.data, cloud);
      const after = JSON.stringify(this.data);
      if (before === after) return { merged: false };
      // Persist the merged result locally and bounce it back to the cloud so
      // both copies converge. Skip the cloud write if we're already in sync.
      try { localStorage.setItem(KEY_V2, after); } catch { /* ignore */ }
      scheduleCloudWrite(after);
      return { merged: true };
    } catch {
      return { merged: false };
    }
  },
};
