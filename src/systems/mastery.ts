/**
 * Mastery Tracks (MVP)
 *
 * Per-theme progression projected purely from existing `medals` save data —
 * no schema change required. Each Tour theme (beach, desert, arctic, …)
 * gains a mastery tier as the player upgrades its medals:
 *
 *   Tier 0 — None        (no medals yet)
 *   Tier 1 — Bronze      (every theme level has at least bronze)
 *   Tier 2 — Silver      (every theme level has at least silver)
 *   Tier 3 — Gold        (every theme level has gold — matches the
 *                         existing `*_master` titles in titles.ts)
 *
 * Progress within a tier shows the share of theme levels already meeting
 * the *next* tier's requirement, so the bar always points at the next
 * concrete goal. At Tier 3 the bar is full and the next-tier label is
 * "Mastered".
 *
 * Surfaced in the Profile screen via a new "Theme Mastery" section.
 */

import { LEVELS } from '../data/levels';
import type { ThemeName } from '../constants';
import { Storage } from './storage';

export type MasteryTier = 0 | 1 | 2 | 3;

export interface ThemeMastery {
  /** Theme key (matches `Level.theme`). */
  theme: ThemeName;
  /** Display label, capitalized. */
  label: string;
  /** Current mastery tier (0–3). */
  tier: MasteryTier;
  /** Short tier name: "—", "Bronze", "Silver", "Gold". */
  tierLabel: string;
  /** Goal text for the next tier, e.g. "Silver Mastery" or "Mastered". */
  nextLabel: string;
  /** Levels meeting the next-tier requirement / total theme levels (0..1). */
  progress: number;
  /** How many theme levels meet next tier. 0 when already at Gold. */
  metCount: number;
  /** Total non-boss levels in the theme. */
  totalCount: number;
  /** Tally of best medal per level. */
  goldCount: number;
  silverCount: number;
  bronzeCount: number;
  noneCount: number;
}

const TIER_LABELS = ['—', 'Bronze', 'Silver', 'Gold'] as const;
const NEXT_TIER_LABELS = ['Bronze Mastery', 'Silver Mastery', 'Gold Mastery', 'Mastered'] as const;

function capitalize(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

/** Theme order matches Tour progression. Boss theme is intentionally excluded
 *  (single boss level — mastery doesn't make sense there). */
function tourThemes(): ThemeName[] {
  const seen = new Set<ThemeName>();
  const out: ThemeName[] = [];
  for (const l of LEVELS) {
    if (l.boss || l.theme === 'boss') continue;
    if (!seen.has(l.theme)) { seen.add(l.theme); out.push(l.theme); }
  }
  return out;
}

function computeThemeMastery(theme: ThemeName): ThemeMastery {
  const ls = LEVELS.filter(l => l.theme === theme && !l.boss);
  const medals = Storage.data.medals || {};
  let gold = 0, silver = 0, bronze = 0, none = 0;
  for (const l of ls) {
    const m = medals[l.id] || 0;
    if (m >= 3) gold++;
    else if (m === 2) silver++;
    else if (m === 1) bronze++;
    else none++;
  }
  const total = ls.length;

  // Tier = highest threshold every level clears.
  let tier: MasteryTier = 0;
  if (total > 0) {
    if (gold === total) tier = 3;
    else if (gold + silver === total) tier = 2;
    else if (gold + silver + bronze === total) tier = 1;
    else tier = 0;
  }

  // Progress toward the next tier: share of levels at next threshold or above.
  let metCount = 0;
  if (tier === 0) metCount = bronze + silver + gold;   // levels with bronze+
  else if (tier === 1) metCount = silver + gold;       // levels with silver+
  else if (tier === 2) metCount = gold;                // levels with gold
  else metCount = 0;                                   // already mastered
  const progress = tier === 3 ? 1 : (total > 0 ? metCount / total : 0);

  return {
    theme,
    label: capitalize(theme),
    tier,
    tierLabel: TIER_LABELS[tier],
    nextLabel: NEXT_TIER_LABELS[tier],
    progress,
    metCount,
    totalCount: total,
    goldCount: gold,
    silverCount: silver,
    bronzeCount: bronze,
    noneCount: none,
  };
}

/** Mastery summary for every Tour theme, in Tour order. */
export function themeMastery(): ThemeMastery[] {
  return tourThemes().map(computeThemeMastery);
}

/** True once every Tour theme is at Gold tier. */
export function allThemesMastered(): boolean {
  const all = themeMastery();
  return all.length > 0 && all.every(m => m.tier === 3);
}
