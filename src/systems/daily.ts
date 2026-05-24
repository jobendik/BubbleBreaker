import { DAILY_MODIFIERS, type DailyModifierId } from '../constants';
import { LEVELS } from '../data/levels';
import { Platform as Sdk } from './platform';
import { Storage, type MedalTier } from './storage';

/** Today's UTC date in YYYY-MM-DD form. Stable across timezones so all players
 *  see the same daily challenge regardless of where they are. */
export function todayUTC(date: Date = new Date()): string {
  return date.getUTCFullYear() + '-'
    + String(date.getUTCMonth() + 1).padStart(2, '0') + '-'
    + String(date.getUTCDate()).padStart(2, '0');
}

/** Yesterday's UTC date relative to a reference date (used for streak tracking). */
export function yesterdayUTC(reference: Date = new Date()): string {
  const d = new Date(reference);
  d.setUTCDate(d.getUTCDate() - 1);
  return todayUTC(d);
}

/** Deterministic 32-bit hash from a string. FNV-1a. */
function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export interface DailyPick {
  date: string;
  levelIndex: number;
  modifierId: DailyModifierId;
  modifierLabel: string;
  modifierDesc: string;
}

/** Pick today's challenge: a non-boss level + one modifier, derived from the date. */
export function pickDailyChallenge(date: string = todayUTC()): DailyPick {
  // Exclude the boss level from the daily pool — it's a different game shape.
  const playableCount = LEVELS.filter(l => !l.boss).length;
  const levelIndex = hash32(date + ':level') % playableCount;
  const modifier = DAILY_MODIFIERS[hash32(date + ':modifier') % DAILY_MODIFIERS.length];
  return {
    date,
    levelIndex,
    modifierId: modifier.id,
    modifierLabel: modifier.label,
    modifierDesc: modifier.desc,
  };
}

/** Compute medal tier for a score on a given level. */
export function medalFor(score: number, targetScore: number): MedalTier {
  if (targetScore <= 0) return 0;
  const bronze = targetScore;
  const silver = Math.floor(targetScore * 1.25);
  const gold   = Math.floor(targetScore * 1.5);
  if (score >= gold)   return 3;
  if (score >= silver) return 2;
  if (score >= bronze) return 1;
  return 0;
}

/** Whether the player has already attempted today's daily (streak-counting). */
export function hasPlayedToday(): boolean {
  return Storage.data.dailyLastPlayed === todayUTC();
}

/** Streak that the menu should display. Returns the live streak if it's still
 *  intact (played today or yesterday), 0 if broken. */
export function liveStreak(): number {
  const last = Storage.data.dailyLastPlayed;
  if (!last) return 0;
  const today = todayUTC();
  const yest  = yesterdayUTC();
  if (last === today || last === yest) return Storage.data.dailyStreak;
  return 0;
}

/** Days between two YYYY-MM-DD UTC date strings. Returns null if either is empty. */
function daysBetween(earlier: string, later: string): number | null {
  if (!earlier || !later) return null;
  const e = Date.parse(earlier + 'T00:00:00Z');
  const l = Date.parse(later   + 'T00:00:00Z');
  if (isNaN(e) || isNaN(l)) return null;
  return Math.round((l - e) / 86_400_000);
}

/** Whether to show a welcome-back banner on the main menu, and what to say.
 *  Returns null if the player is new or already played today. */
export function welcomeBackMessage(): { title: string; subtitle: string } | null {
  const last = Storage.data.lastSessionDate;
  const today = todayUTC();
  if (!last || last === today) return null;
  const days = daysBetween(last, today) ?? 0;
  if (days <= 0) return null;
  if (days === 1) {
    const streak = liveStreak();
    return {
      title: 'Welcome back!',
      subtitle: streak > 0
        ? `Your ${streak}-day streak is on the line — play today's challenge to keep it.`
        : "Today's challenge is waiting.",
    };
  }
  if (days < 7) return { title: 'Welcome back!', subtitle: `It's been ${days} days. A new daily challenge is waiting.` };
  if (days < 30) return { title: 'Welcome back!', subtitle: 'A lot has happened since your last visit.' };
  return { title: 'Welcome back!', subtitle: "It's been a while. Pick up where you left off." };
}

/** Module-local cache of the welcome-back state, computed once at boot
 *  against the previous lastSessionDate (before we update it). */
let _welcomeBackCache: ReturnType<typeof welcomeBackMessage> | null = null;

/** Username pulled from the CrazyGames SDK after init. When set, the menu
 *  uses it to personalize the welcome-back banner ("Welcome back, Jo!"). */
let _username: string | null = null;
export function setUsername(name: string | null) {
  _username = name && name.trim() ? name.trim() : null;
  if (_username && _welcomeBackCache) {
    _welcomeBackCache = { ..._welcomeBackCache, title: 'Welcome back, ' + _username + '!' };
  }
}
export function getUsername() { return _username; }

/** Call once at boot — captures any welcome-back greeting, then marks today
 *  as the most recent session so tomorrow's visit detects "1 day ago". */
export function captureWelcomeBack() {
  _welcomeBackCache = welcomeBackMessage();
  Storage.data.lastSessionDate = todayUTC();
  Storage.save();
}

/** What the main menu should render — captured at boot, stable for the session. */
export function getWelcomeBackBanner() { return _welcomeBackCache; }

/** Clear the banner (e.g., player tapped it). */
export function dismissWelcomeBack() { _welcomeBackCache = null; }

/** Record a daily attempt result. Updates streak, lastPlayed, and dailyBest. */
export function recordDailyAttempt(score: number) {
  const today = todayUTC();
  const last = Storage.data.dailyLastPlayed;
  const prevStreak = Storage.data.dailyStreak || 0;
  let streakMilestone = false;
  if (last !== today) {
    // First attempt today: bump or reset streak.
    if (last === yesterdayUTC()) {
      Storage.data.dailyStreak = prevStreak + 1;
    } else {
      Storage.data.dailyStreak = 1;
    }
    Storage.data.dailyLastPlayed = today;
    // 3 and 7-day streaks are tangible status moments. Fire happytime() to
    // tell CrazyGames "this player just had a high-satisfaction moment."
    const newStreak = Storage.data.dailyStreak;
    if (newStreak !== prevStreak && (newStreak === 3 || newStreak === 7 || (newStreak > 7 && newStreak % 7 === 0))) {
      streakMilestone = true;
    }
  }
  const prev = Storage.data.dailyBest[today] || 0;
  const newDailyPB = score > prev;
  if (newDailyPB) Storage.data.dailyBest[today] = score;
  Storage.save();
  // Daily PB or streak milestone -> peak signal. Daily wins are the kind of
  // bite-sized success CrazyGames specifically rewards in its algorithm.
  if (newDailyPB || streakMilestone) Sdk.happytime();
}
