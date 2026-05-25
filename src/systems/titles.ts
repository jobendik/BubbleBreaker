import { LEVELS } from '../data/levels';
import type { ThemeName } from '../constants';
import { Storage, type MedalTier } from './storage';

/**
 * Lightweight identity layer. Titles are *computed* on demand from the
 * existing save fields (medals, streak, bests, lifetime combo) — there is no
 * separate "unlocked titles" array. Adding a new title is a one-line change
 * here.
 *
 * Listed in display priority (most prestigious first). The main menu shows
 * the highest-priority earned title; everything else is implicit progress.
 */

export interface Title {
  id: string;
  label: string;
  /** Returns true if the player has earned this title given current save state. */
  earned: () => boolean;
}

export interface TrickContract {
  id: string;
  label: string;
  title: string;
  target: number;
  rewardTitleId: string;
}

export interface PlayerPalette {
  id: string;
  label: string;
  colors: {
    body: string;
    bodyDark: string;
    bodyHi: string;
    boot: string;
    hat: string;
    hatHi: string;
    hatDark: string;
    accent: string;
  };
  unlocked: () => boolean;
}

function levelsOfTheme(theme: ThemeName) {
  return LEVELS.filter(l => l.theme === theme && !l.boss);
}

function allGoldInTheme(theme: ThemeName): boolean {
  const ls = levelsOfTheme(theme);
  if (ls.length === 0) return false;
  return ls.every(l => (Storage.data.medals[l.id] || 0) === 3);
}

function allGoldOverall(): boolean {
  const playable = LEVELS.filter(l => !l.boss);
  if (playable.length === 0) return false;
  return playable.every(l => (Storage.data.medals[l.id] || 0) === 3);
}

/** Master list, ordered from most to least prestigious. */
export const TITLES: Title[] = [
  { id: 'bubble_sage',   label: 'Bubble Sage',     earned: () => allGoldOverall() },
  { id: 'daily_devotee', label: 'Daily Devotee',   earned: () => (Storage.data.dailyStreak || 0) >= 7 },
  { id: 'boss_slayer',   label: 'Boss Slayer',     earned: () => Storage.data.unlockedLevel >= LEVELS.length },
  { id: 'weekly_legend', label: 'Weekly Legend',   earned: () => (Storage.data.missionStars || 0) >= 25 },
  { id: 'mission_captain', label: 'Mission Captain', earned: () => (Storage.data.missionStars || 0) >= 12 },
  { id: 'bank_master',   label: 'Bank Master',     earned: () => (Storage.data.trickStats?.bank_shot || 0) >= 15 },
  { id: 'air_artist',    label: 'Air Artist',      earned: () => (Storage.data.trickStats?.air_pop || 0) >= 20 },
  { id: 'clutch_hero',   label: 'Clutch Hero',     earned: () => (Storage.data.trickStats?.clutch || 0) >= 3 },
  { id: 'danger_dancer', label: 'Danger Dancer',   earned: () => (Storage.data.trickStats?.close_call || 0) >= 20 },
  { id: 'detonator',     label: 'Detonator',       earned: () => (Storage.data.bestMultiPop || 0) >= 5 },
  { id: 'marksman',      label: 'Marksman',        earned: () => (Storage.data.lifetimePops || 0) >= 500 },
  { id: 'airship_master',label: 'Airship Master',  earned: () => allGoldInTheme('airship') },
  { id: 'volcano_master',label: 'Volcano Master',  earned: () => allGoldInTheme('volcano') },
  { id: 'city_master',   label: 'City Master',     earned: () => allGoldInTheme('city') },
  { id: 'arctic_master', label: 'Arctic Master',   earned: () => allGoldInTheme('arctic') },
  { id: 'desert_master', label: 'Desert Master',   earned: () => allGoldInTheme('desert') },
  { id: 'beach_master',  label: 'Beach Master',    earned: () => allGoldInTheme('beach') },
  { id: 'wave_rider',    label: 'Wave Rider',      earned: () => (Storage.data.bestPanicWave || 0) >= 10 },
  { id: 'trickster',     label: 'Trickster',       earned: () => (Storage.data.lifetimeTricks || 0) >= 25 },
  { id: 'combo_crusher', label: 'Combo Crusher',   earned: () => (Storage.data.lifetimeMaxCombo || 0) >= 20 },
  { id: 'score_hunter',  label: 'Score Hunter',    earned: () => (Storage.data.bestScoreAttack || 0) >= 20000 },
  { id: 'streak_starter',label: 'Streak Starter',  earned: () => (Storage.data.dailyStreak || 0) >= 3 },
  { id: 'bubble_buster', label: 'Bubble Buster',   earned: () => (Storage.data.unlockedLevel || 0) >= 1 },
];

/** Returns the highest-priority title the player has currently earned, or null. */
export function currentTitle(): Title | null {
  const equipped = Storage.data.equippedTitleId;
  if (equipped) {
    const title = TITLES.find(t => t.id === equipped);
    if (title?.earned()) return title;
  }
  for (const t of TITLES) if (t.earned()) return t;
  return null;
}

/** All earned titles, in priority order. */
export function earnedTitles(): Title[] {
  return TITLES.filter(t => t.earned());
}

/** All locked titles in display order. Used by the Stats screen to show the
 *  player what's next to chase. */
export function lockedTitles(): Title[] {
  return TITLES.filter(t => !t.earned());
}

/** Diff earned titles against `seenTitleIds` in the save. Returns any titles
 *  that just became earnable without having been announced. The caller is
 *  responsible for showing the toast and then calling markTitlesSeen. */
export function newlyEarnedTitles(): Title[] {
  const seen = new Set((Storage.data.seenTitleIds || '').split(',').filter(Boolean));
  return earnedTitles().filter(t => !seen.has(t.id));
}

/** Mark a batch of title ids as seen so they don't re-toast next session. */
export function markTitlesSeen(ids: string[]): void {
  const seen = new Set((Storage.data.seenTitleIds || '').split(',').filter(Boolean));
  for (const id of ids) seen.add(id);
  Storage.data.seenTitleIds = Array.from(seen).join(',');
  Storage.save();
}

export function equipTitle(id: string): boolean {
  if (id === '') {
    Storage.data.equippedTitleId = '';
    Storage.save();
    return true;
  }
  const title = TITLES.find(t => t.id === id);
  if (!title?.earned()) return false;
  Storage.data.equippedTitleId = id;
  Storage.save();
  return true;
}

export const TRICK_CONTRACTS: TrickContract[] = [
  { id: 'bank_shot',  label: 'Bank Shots',  title: 'Bank Master',   target: 15, rewardTitleId: 'bank_master' },
  { id: 'air_pop',    label: 'Air Pops',    title: 'Air Artist',    target: 20, rewardTitleId: 'air_artist' },
  { id: 'close_call', label: 'Close Calls', title: 'Danger Dancer', target: 20, rewardTitleId: 'danger_dancer' },
  { id: 'clutch',     label: 'Clutches',    title: 'Clutch Hero',   target: 3,  rewardTitleId: 'clutch_hero' },
];

export function recordTrick(id: string): { count: number; contract?: TrickContract; completedNow: boolean } {
  if (!Storage.data.trickStats) Storage.data.trickStats = {};
  const before = Storage.data.trickStats[id] || 0;
  const count = before + 1;
  Storage.data.trickStats[id] = count;
  const contract = TRICK_CONTRACTS.find(c => c.id === id);
  Storage.save();
  return { count, contract, completedNow: !!contract && before < contract.target && count >= contract.target };
}

export const PLAYER_PALETTES: PlayerPalette[] = [
  {
    id: 'classic',
    label: 'Classic Blue',
    colors: { body: '#3a86ff', bodyDark: '#1b4fb8', bodyHi: '#74b3ff', boot: '#0e2a6a', hat: '#6b4a2a', hatHi: '#8b6a4a', hatDark: '#3a2614', accent: '#ffd60a' },
    unlocked: () => true,
  },
  {
    id: 'mint',
    label: 'Mint Runner',
    colors: { body: '#06d6a0', bodyDark: '#04785d', bodyHi: '#70ffd5', boot: '#063b32', hat: '#135f63', hatHi: '#3a9da3', hatDark: '#073336', accent: '#9be7ff' },
    unlocked: () => (Storage.data.lifetimePops || 0) >= 75,
  },
  {
    id: 'sunburst',
    label: 'Sunburst',
    colors: { body: '#ff7f50', bodyDark: '#a33a16', bodyHi: '#ffc19f', boot: '#5b210c', hat: '#7a4d11', hatHi: '#c48a28', hatDark: '#3d2608', accent: '#ffd60a' },
    unlocked: () => (Storage.data.dailyStreak || 0) >= 3,
  },
  {
    id: 'violet',
    label: 'Violet Pro',
    colors: { body: '#9e7bff', bodyDark: '#4a2ca8', bodyHi: '#c9b7ff', boot: '#21104f', hat: '#43246e', hatHi: '#7650a8', hatDark: '#221136', accent: '#ff36c4' },
    unlocked: () => (Storage.data.lifetimeMaxCombo || 0) >= 15,
  },
  {
    id: 'gold',
    label: 'Gold Medalist',
    colors: { body: '#ffd60a', bodyDark: '#9a6b00', bodyHi: '#fff3a3', boot: '#4a3300', hat: '#6b4a00', hatHi: '#d49a13', hatDark: '#2c1d00', accent: '#ffffff' },
    unlocked: () => Object.values(Storage.data.medals || {}).some(m => m === 3),
  },
  {
    id: 'ruby',
    label: 'Ruby Circuit',
    colors: { body: '#ef476f', bodyDark: '#8d1231', bodyHi: '#ff9bb2', boot: '#340715', hat: '#272932', hatHi: '#575a66', hatDark: '#11121a', accent: '#ffd60a' },
    unlocked: () => (Storage.data.missionStars || 0) >= 5,
  },
  {
    id: 'neon',
    label: 'Neon Pulse',
    colors: { body: '#00f5d4', bodyDark: '#006e65', bodyHi: '#a7fff2', boot: '#071f2a', hat: '#f72585', hatHi: '#ff8ac4', hatDark: '#5c0b34', accent: '#fee440' },
    unlocked: () => (Storage.data.missionStars || 0) >= 12,
  },
  {
    id: 'rift',
    label: 'Rift Runner',
    colors: { body: '#4361ee', bodyDark: '#1f2f83', bodyHi: '#9aa7ff', boot: '#0b102c', hat: '#7209b7', hatHi: '#b56dff', hatDark: '#2e064c', accent: '#4cc9f0' },
    unlocked: () => (Storage.data.bestPanicWave || 0) >= 8,
  },
];

export function equippedPalette(): PlayerPalette {
  const id = Storage.data.playerPaletteId || 'classic';
  const palette = PLAYER_PALETTES.find(p => p.id === id);
  if (palette?.unlocked()) return palette;
  return PLAYER_PALETTES[0];
}

export function equipPalette(id: string): boolean {
  const palette = PLAYER_PALETTES.find(p => p.id === id);
  if (!palette?.unlocked()) return false;
  Storage.data.playerPaletteId = id;
  Storage.save();
  return true;
}
