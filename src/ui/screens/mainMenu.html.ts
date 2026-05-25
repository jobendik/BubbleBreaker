/**
 * HTML/CSS main menu — replaces renderMainMenu in src/state/mainMenu.ts.
 *
 * Public API:
 *   buildMainMenu(game): HTMLElement — constructs the screen, wires events,
 *                                       returns the root element (caller mounts).
 *   syncMainMenu(game, root): void   — per-frame sync of dynamic bits (welcome
 *                                       banner, daily-hot state, idle hints,
 *                                       resume label, title chip, sound icon).
 *
 * The screen is built once at boot and lives in #ui-root. Visibility is
 * toggled by domRoot.ts via the `.is-active` class. Per-frame sync runs only
 * while the menu is active — it touches the DOM only when state actually
 * changes (cached previous values) to keep the cost trivial.
 */

import { LEVELS } from '../../data/levels';
import { State } from '../../constants';
import { AudioSys } from '../../systems/audio';
import {
  dismissWelcomeBack,
  getWelcomeBackBanner,
  hasPlayedToday,
  liveStreak,
  todayUTC,
} from '../../systems/daily';
import { Storage } from '../../systems/storage';
import { currentTitle } from '../../systems/titles';
import type { Game } from '../../game';

const IDLE_HINTS = [
  '🔥 Daily streaks grow over consecutive days — don\'t miss a day.',
  'Local co-op: a second player can join with I / K / U on desktop.',
  'Chain pops fast — your combo decays if you wait too long.',
  'Each level has bronze, silver, and gold medals to chase.',
  'Score Attack and Panic Mode live under Modes — try them once.',
  'Pickups change your weapon. Try the laser, flamethrower, and bomb.',
];
const IDLE_DELAY  = 6;
const IDLE_PERIOD = 5;

const SECONDARY: { key: string; label: string; target: string }[] = [
  { key: 'levels',   label: 'Levels',   target: State.LEVEL_SELECT },
  { key: 'modes',    label: 'Modes',    target: State.MODE_SELECT  },
  { key: 'stats',    label: 'Stats',    target: State.STATS        },
  { key: 'controls', label: 'Controls', target: State.CONTROLS     },
  { key: 'credits',  label: 'Credits',  target: State.CREDITS      },
];

function getResumeLevel(game: Game) {
  return Math.min(game.unlockedLevel, LEVELS.length - 1);
}

export function buildMainMenu(game: Game): HTMLElement {
  const root = document.createElement('section');
  root.className = 'ui-screen menu menu-backdrop';
  root.setAttribute('data-screen', 'main_menu');
  root.setAttribute('role', 'region');
  root.setAttribute('aria-label', 'Main menu');

  // Brand strap above the title
  const brand = document.createElement('div');
  brand.className = 'menu__brand';
  brand.innerHTML = `<span class="menu__brand-tag">Arcade Edition</span>`;
  root.appendChild(brand);

  // --- Title chip (top-left, populated on sync) ---
  const titleChip = document.createElement('div');
  titleChip.className = 'menu__title-chip';
  titleChip.hidden = true;
  titleChip.innerHTML = `
    <span class="menu__title-chip-label">TITLE</span>
    <span class="menu__title-chip-value" data-role="title-value"></span>
  `;
  root.appendChild(titleChip);

  // --- Sound toggle (top-right) ---
  const soundBtn = document.createElement('button');
  soundBtn.type = 'button';
  soundBtn.className = 'menu__sound';
  soundBtn.setAttribute('aria-label', 'Toggle sound');
  soundBtn.dataset.role = 'sound-toggle';
  soundBtn.textContent = '🔊';
  soundBtn.addEventListener('click', () => {
    AudioSys.toggle();
    Storage.data.muted = AudioSys.muted;
    Storage.save();
    soundBtn.textContent = AudioSys.muted ? '🔇' : '🔊';
  });
  root.appendChild(soundBtn);

  // --- Drifting bubbles (12 of them, positions/scales derived from --i) ---
  const bubbles = document.createElement('div');
  bubbles.className = 'menu__bubbles';
  bubbles.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 12; i++) {
    const b = document.createElement('div');
    b.className = 'bubble';
    b.style.setProperty('--i', String(i));
    bubbles.appendChild(b);
  }
  root.appendChild(bubbles);

  // --- Title block ---
  const titleWrap = document.createElement('div');
  titleWrap.className = 'menu__title-wrap';
  titleWrap.innerHTML = `
    <h1 class="menu__title">Bubble Breaker</h1>
    <p class="menu__subtitle">Adventure</p>
  `;
  root.appendChild(titleWrap);

  // --- Welcome-back banner (populated on sync, click to dismiss) ---
  const welcome = document.createElement('button');
  welcome.type = 'button';
  welcome.className = 'menu__welcome';
  welcome.hidden = true;
  welcome.dataset.role = 'welcome';
  welcome.innerHTML = `
    <div>
      <div class="menu__welcome-title" data-role="welcome-title"></div>
      <div class="menu__welcome-sub"   data-role="welcome-sub"></div>
    </div>
    <span class="menu__welcome-dismiss">Tap to dismiss</span>
  `;
  welcome.addEventListener('click', () => {
    AudioSys.menu();
    dismissWelcomeBack();
    welcome.hidden = true;
  });
  root.appendChild(welcome);

  // --- CTA stack ---
  const cta = document.createElement('div');
  cta.className = 'menu__cta-stack';
  root.appendChild(cta);

  // PLAY / CONTINUE
  const playBtn = document.createElement('button');
  playBtn.type = 'button';
  playBtn.className = 'menu__play';
  playBtn.dataset.role = 'play';
  playBtn.innerHTML = `
    <span class="menu__play-label" data-role="play-label">▶  PLAY</span>
    <span class="menu__play-sub"   data-role="play-sub">Start the adventure</span>
  `;
  playBtn.addEventListener('click', () => {
    AudioSys.menu();
    game.startTour(getResumeLevel(game));
  });
  cta.appendChild(playBtn);

  // Daily Challenge
  const dailyBtn = document.createElement('button');
  dailyBtn.type = 'button';
  dailyBtn.className = 'menu__daily';
  dailyBtn.dataset.role = 'daily';
  dailyBtn.innerHTML = `
    <div>
      <span class="menu__daily-title">TODAY'S CHALLENGE</span>
      <span class="menu__daily-sub" data-role="daily-sub">New challenge every day.</span>
    </div>
    <span class="menu__daily-streak" data-role="daily-streak" hidden></span>
    <span class="menu__daily-badge"  data-role="daily-badge"  hidden>NEW</span>
  `;
  dailyBtn.addEventListener('click', () => {
    AudioSys.menu();
    game.openDaily();
  });
  cta.appendChild(dailyBtn);

  // --- Secondary nav ---
  const secondary = document.createElement('nav');
  secondary.className = 'menu__secondary';
  secondary.setAttribute('aria-label', 'More');
  for (const item of SECONDARY) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ui-btn';
    b.textContent = item.label;
    b.addEventListener('click', () => {
      AudioSys.menu();
      game.state = item.target as Game['state'];
    });
    secondary.appendChild(b);
  }
  root.appendChild(secondary);

  // --- Footer ---
  const footer = document.createElement('div');
  footer.className = 'menu__footer';
  footer.innerHTML = `
    <div class="menu__footer-default">Click &nbsp;•&nbsp; Tap &nbsp;•&nbsp; Enter to play</div>
    <div class="menu__footer-hint" data-role="footer-hint"></div>
  `;
  root.appendChild(footer);

  // Cache the dynamic refs so syncMainMenu doesn't re-query every frame.
  const refs = {
    titleChip,
    titleValue:  titleChip.querySelector('[data-role="title-value"]') as HTMLElement,
    soundBtn,
    welcome,
    welcomeTitle: welcome.querySelector('[data-role="welcome-title"]') as HTMLElement,
    welcomeSub:   welcome.querySelector('[data-role="welcome-sub"]')   as HTMLElement,
    playBtn,
    playLabel:   playBtn.querySelector('[data-role="play-label"]')     as HTMLElement,
    playSub:     playBtn.querySelector('[data-role="play-sub"]')       as HTMLElement,
    dailyBtn,
    dailySub:    dailyBtn.querySelector('[data-role="daily-sub"]')     as HTMLElement,
    dailyStreak: dailyBtn.querySelector('[data-role="daily-streak"]')  as HTMLElement,
    dailyBadge:  dailyBtn.querySelector('[data-role="daily-badge"]')   as HTMLElement,
    footerHint:  footer.querySelector('[data-role="footer-hint"]')     as HTMLElement,
  };
  (root as any).__refs = refs;
  (root as any).__lastInputT = 0;
  (root as any).__cachedHintIndex = -1;
  return root;
}

interface Refs {
  titleChip: HTMLElement; titleValue: HTMLElement;
  soundBtn: HTMLElement;
  welcome: HTMLElement; welcomeTitle: HTMLElement; welcomeSub: HTMLElement;
  playBtn: HTMLElement; playLabel: HTMLElement; playSub: HTMLElement;
  dailyBtn: HTMLElement; dailySub: HTMLElement; dailyStreak: HTMLElement; dailyBadge: HTMLElement;
  footerHint: HTMLElement;
}

/** Per-frame sync — runs only while the menu is the active screen. Cheap:
 *  every DOM write is guarded by a value-changed check stored on the node. */
export function syncMainMenu(game: Game, root: HTMLElement) {
  const refs = (root as any).__refs as Refs;
  if (!refs) return;

  // --- PLAY / CONTINUE label ---
  const resume = getResumeLevel(game);
  const hasProgress = game.unlockedLevel > 0;
  const playLabel = hasProgress ? '▶  CONTINUE' : '▶  PLAY';
  const playSub   = hasProgress
    ? 'Level ' + (resume + 1) + ' — ' + LEVELS[resume].name
    : 'Start the adventure';
  setText(refs.playLabel, playLabel);
  setText(refs.playSub, playSub);

  // --- Daily state ---
  const playedToday = hasPlayedToday();
  const streak      = liveStreak();
  const isHot       = !playedToday;
  toggleClass(refs.dailyBtn, 'is-hot', isHot);
  toggleClass(refs.playBtn,  'is-calm', isHot);   // calm down PLAY when daily is the hero
  setText(refs.dailySub, playedToday
    ? 'Played today — best ' + (Storage.data.dailyBest[todayUTC()] || 0)
    : (streak > 0 ? 'Keep your streak alive!' : 'New challenge every day.'));
  refs.dailyBadge.hidden  = !isHot;
  refs.dailyStreak.hidden = streak <= 0;
  if (streak > 0) setText(refs.dailyStreak, '🔥 ' + streak);

  // --- Welcome banner ---
  const welcome = getWelcomeBackBanner();
  if (welcome) {
    refs.welcome.hidden = false;
    setText(refs.welcomeTitle, welcome.title);
    setText(refs.welcomeSub,   welcome.subtitle);
  } else {
    refs.welcome.hidden = true;
  }

  // --- Title chip ---
  const title = currentTitle();
  if (title) {
    refs.titleChip.hidden = false;
    setText(refs.titleValue, title.label);
  } else {
    refs.titleChip.hidden = true;
  }

  // --- Sound icon ---
  setText(refs.soundBtn, AudioSys.muted ? '🔇' : '🔊');

  // --- Idle-hint rotation (footer cross-fade) ---
  // Bump on any keyboard or pointer activity in the last frame. The
  // canvas-pointer event listener still records pointer.x changes; we
  // detect engagement by sampling a coarse hash of the input state.
  const inputSignal = (game as any).t * 0 + Date.now(); // sentinel; real engagement triggers below
  void inputSignal;
  // Idle clock: track last activity by listening for any window event.
  // Simpler: read game.t and reset on click of any menu element via a
  // bubbling listener attached in mountIdleResetOnce().
  mountIdleResetOnce(root);
  const lastInput = (root as any).__lastInputT as number;
  const idle = game.t - lastInput;
  const isIdle = idle > IDLE_DELAY;
  toggleClass(root, 'is-idle', isIdle);
  if (isIdle) {
    const phase = Math.floor((idle - IDLE_DELAY) / IDLE_PERIOD) % IDLE_HINTS.length;
    if ((root as any).__cachedHintIndex !== phase) {
      (root as any).__cachedHintIndex = phase;
      setText(refs.footerHint, IDLE_HINTS[phase]);
    }
  }
}

// ---- helpers ----
function setText(el: HTMLElement, value: string) {
  if (el.textContent !== value) el.textContent = value;
}
function toggleClass(el: HTMLElement, cls: string, on: boolean) {
  if (el.classList.contains(cls) !== on) el.classList.toggle(cls, on);
}
function mountIdleResetOnce(root: HTMLElement) {
  if ((root as any).__idleBound) return;
  (root as any).__idleBound = true;
  const reset = () => {
    // Game's `t` is the canonical clock; UIRoot.sync passes the game in.
    // We stash a setter on the root so we can update __lastInputT from the
    // bubble handler without re-entrancy.
    (root as any).__needsIdleReset = true;
  };
  root.addEventListener('pointermove', reset, { passive: true });
  root.addEventListener('pointerdown', reset, { passive: true });
  root.addEventListener('keydown',     reset, { passive: true });
}

/** Called by sync() so the menu knows the current game.t to apply the idle reset. */
export function tickMainMenuIdleClock(game: Game, root: HTMLElement) {
  if ((root as any).__needsIdleReset) {
    (root as any).__lastInputT = game.t;
    (root as any).__needsIdleReset = false;
  }
}
