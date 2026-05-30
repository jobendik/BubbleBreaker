/**
 * First-play touch onboarding overlay.
 *
 * Shown ONCE on the first PLAYING entry on a touch device. Translucent
 * dim with two zone-area markers (left half = move left, right half = move
 * right), plus a "Tap anywhere to start" footer. Dismisses on any tap, on
 * the player's first horizontal move, or after 7 seconds.
 *
 * On dismiss we set Storage.mobileOnboardingSeen and persist. That same
 * flag also gates auto-fire (input.ts) so the player isn't auto-firing
 * harpoons into the ceiling while the overlay is still up.
 *
 * Desktop never sees this — the overlay never opens on non-touch.
 */

import { State } from '../../constants';
import { isTouchDevice, keysPressed } from '../../systems/input';
import { Storage } from '../../systems/storage';
import { AudioSys } from '../../systems/audio';
import type { Game } from '../../game';

let rootEl: HTMLElement | null = null;
let openedAtMs = 0;
let isOpen = false;
let dismissTimer: number | null = null;
/** Previous frame's "playable PLAYING" check — true only when state is
 *  PLAYING AND the intro banner has cleared. Tracking the same predicate as
 *  the open condition is the whole point: a rising edge from false → true
 *  is what triggers the overlay. */
let prevInPlay = false;

const MAX_SHOW_MS = 3200;

function clearDismissTimer() {
  if (dismissTimer !== null) {
    window.clearTimeout(dismissTimer);
    dismissTimer = null;
  }
}

function dismiss() {
  if (!rootEl || !isOpen) return;
  clearDismissTimer();
  isOpen = false;
  rootEl.classList.remove('is-open');
  if (!Storage.data.mobileOnboardingSeen) {
    Storage.data.mobileOnboardingSeen = true;
    Storage.save();
  }
}

function open() {
  if (!rootEl || isOpen) return;
  clearDismissTimer();
  isOpen = true;
  openedAtMs = performance.now();
  rootEl.classList.add('is-open');
  dismissTimer = window.setTimeout(() => dismiss(), MAX_SHOW_MS);
  AudioSys.menu();
}

export function buildOnboardingOverlay(_game: Game): HTMLElement {
  const root = document.createElement('div');
  root.className = 'mobile-onboarding';
  root.setAttribute('aria-hidden', 'true');

  if (!isTouchDevice) {
    // Built-but-inert on desktop so the DOM root doesn't change shape between
    // device classes. CSS @media also hides it.
    root.style.display = 'none';
    rootEl = root;
    return root;
  }

  root.innerHTML = `
    <div class="mobile-onboarding__dim" data-role="dim"></div>

    <div class="mobile-onboarding__marker mobile-onboarding__marker--left">
      <svg class="mobile-onboarding__zone-icon" viewBox="0 0 56 56" aria-hidden="true">
        <circle cx="28" cy="28" r="26" fill="none" stroke="currentColor" stroke-width="2.5" opacity="0.4"/>
        <path d="M30 18 L18 28 L30 38 M18 28 L38 28" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
      </svg>
      <div class="mobile-onboarding__chip">← MOVE LEFT</div>
    </div>

    <div class="mobile-onboarding__marker mobile-onboarding__marker--right">
      <svg class="mobile-onboarding__zone-icon" viewBox="0 0 56 56" aria-hidden="true">
        <circle cx="28" cy="28" r="26" fill="none" stroke="currentColor" stroke-width="2.5" opacity="0.4"/>
        <path d="M26 18 L38 28 L26 38 M38 28 L18 28" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
      </svg>
      <div class="mobile-onboarding__chip">MOVE RIGHT →</div>
    </div>

    <div class="mobile-onboarding__hint">Pop every bubble.<br>Tap anywhere to start.</div>
    <div class="mobile-onboarding__autofire" data-role="autofire-hint">Auto-fire ON · change in Pause</div>
  `;

  // Any tap inside the overlay dismisses it. The overlay sits above the
  // touch-controls in z-order while open, so the first tap goes here.
  root.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    dismiss();
  });

  // Reflect the auto-fire setting in the hint text — players who turned it
  // off elsewhere shouldn't see "ON" messaging.
  if (!Storage.data.mobileAutoFire) {
    const af = root.querySelector<HTMLElement>('[data-role="autofire-hint"]');
    if (af) af.textContent = 'Hold Fire to shoot · change in Pause';
  }

  rootEl = root;
  return root;
}

/** Called every frame from UI.syncFrame (via domRoot). Decides when to show
 *  / auto-dismiss the overlay based on state + input. */
export function tickOnboardingOverlay(game: Game) {
  if (!rootEl || !isTouchDevice) return;
  const inPlay = game.state === State.PLAYING && game.introTimer <= 0;
  if (Storage.data.mobileOnboardingSeen) {
    if (isOpen) dismiss();
    prevInPlay = inPlay;
    return;
  }
  // Rising edge from "not playable" → "playable" opens the overlay. This
  // covers BOTH the post-intro transition AND a resume from pause back into
  // playable gameplay (so a player who paused before reading it gets it on
  // resume).
  if (inPlay && !isOpen && !prevInPlay) {
    open();
  }
  // If state leaves playable PLAYING (pause / game over / intro re-starts),
  // hide the overlay; it re-opens on the next rising edge if not yet seen.
  if (!inPlay && isOpen) {
    rootEl.classList.remove('is-open');
    isOpen = false;
  }
  prevInPlay = inPlay;

  if (isOpen) {
    // Auto-dismiss on first horizontal-move input — the player has clearly
    // gotten the message. Touch handlers set keysPressed via the DOM controls.
    if (keysPressed['ArrowLeft'] || keysPressed['ArrowRight'] || keysPressed['Space']) {
      dismiss();
      return;
    }
    if (performance.now() - openedAtMs >= MAX_SHOW_MS) dismiss();
  }
}
