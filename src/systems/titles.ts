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
