/**
 * DOM touch controls — split-screen movement zones + optional Fire button.
 *
 * Zone model (replaces the old Left / Right arrow buttons):
 *   - Touching anywhere in the LEFT half of the stage moves the player left.
 *   - Touching anywhere in the RIGHT half moves the player right.
 *   - No on-screen buttons are shown for movement — the whole screen IS the
 *     control surface.
 *   - Auto-fire handles shooting by default, so the Fire button is hidden.
 *   - When the player disables auto-fire in Pause, a Fire button appears at
 *     the bottom-centre of the stage.
 *
 * Multi-touch model (unchanged from before):
 *   - pointerdown on a zone/button starts tracking that pointerId.
 *   - pointermove / pointerup / pointercancel are bound to WINDOW so a
 *     finger can slide between zones without losing tracking.
 *   - On every move the pointer is re-mapped to the zone it is currently over.
 *   - The union of "held by any pointer" drives the synthetic `keys[]`
 *     entries the rest of the game already reads.
 *
 * Z-index note: .touch-controls is intentionally one layer below .hud so the
 * pause button (inside .hud) always sits on top and receives taps first.
 */

import { keys, keysPressed, isTouchDevice } from '../../systems/input';
import { Haptics } from '../../systems/haptics';
import { Storage } from '../../systems/storage';
import { AudioSys } from '../../systems/audio';

type BtnId = 'left' | 'right' | 'fire';

const KEY_FOR: Record<BtnId, string> = {
  left:  'ArrowLeft',
  right: 'ArrowRight',
  fire:  'Space',
};

// `left` and `right` are invisible zone divs; `fire` is an optional button.
const buttons: Record<BtnId, HTMLElement | null> = { left: null, right: null, fire: null };
const activePointer = new Map<number, BtnId | null>();
const held: Record<BtnId, boolean> = { left: false, right: false, fire: false };

/** Return the x-coordinate that splits left from right zones (= stage centre).
 *  Derived from the right zone element so it tracks CSS layout exactly. */
function zoneSplitX(): number {
  if (buttons.right) return buttons.right.getBoundingClientRect().left;
  // Should never reach here after buildTouchControls() has run. Fallback to
  // viewport centre so hits are still processed correctly if it somehow does.
  if (import.meta.env.DEV) console.warn('[touchControls] zoneSplitX: buttons.right is null');
  return window.innerWidth / 2;
}

function hitTest(clientX: number, clientY: number): BtnId | null {
  // Fire button takes priority if it is currently visible and touched.
  const fireEl = buttons.fire;
  if (fireEl && !fireEl.hidden) {
    const r = fireEl.getBoundingClientRect();
    if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) {
      return 'fire';
    }
  }
  // Zone split: left half vs right half of the stage.
  return clientX < zoneSplitX() ? 'left' : 'right';
}

function applyHeld(next: Record<BtnId, boolean>) {
  for (const id of ['left', 'right', 'fire'] as const) {
    if (next[id] === held[id]) continue;
    const key = KEY_FOR[id];
    const el = buttons[id];
    if (next[id]) {
      if (!keys[key]) keysPressed[key] = true;
      keys[key] = true;
      el?.classList.add('is-held');
      Haptics.tap();
    } else {
      keys[key] = false;
      el?.classList.remove('is-held');
    }
    held[id] = next[id];
  }
}

function recompute() {
  const next: Record<BtnId, boolean> = { left: false, right: false, fire: false };
  for (const id of activePointer.values()) if (id) next[id] = true;
  applyHeld(next);
}

function onPointerDown(e: PointerEvent) {
  const btn = hitTest(e.clientX, e.clientY);
  if (!btn) return;
  // Prevent the browser from synthesizing a long-press context menu / drag
  // image, and from sending duplicate mouse events to the canvas underneath.
  e.preventDefault();
  activePointer.set(e.pointerId, btn);
  recompute();
  AudioSys.init();   // user gesture — unlock audio if still locked
}

function onPointerMove(e: PointerEvent) {
  if (!activePointer.has(e.pointerId)) return;
  const next = hitTest(e.clientX, e.clientY);
  if (next !== activePointer.get(e.pointerId)) {
    activePointer.set(e.pointerId, next);
    recompute();
  }
}

function releasePointer(e: PointerEvent) {
  if (!activePointer.has(e.pointerId)) return;
  activePointer.delete(e.pointerId);
  recompute();
}

/** Called from input.ts on window blur — drop everything cleanly so no key
 *  ends up stuck in the held state after a tab-out. */
export function releaseAllTouchControls() {
  if (activePointer.size === 0 && !held.left && !held.right && !held.fire) return;
  activePointer.clear();
  applyHeld({ left: false, right: false, fire: false });
}

/** Apply current saved settings to the controls. Idempotent — safe to call
 *  on any settings change or at boot. */
export function applyTouchControlSettings() {
  const scale = Math.max(0.6, Math.min(1.4, Storage.data.mobileTouchScale || 1));
  document.body.style.setProperty('--touch-scale', String(scale));
  // Show the fire button only when auto-fire is disabled so the screen stays
  // clean for the default (auto-fire on) experience.
  if (buttons.fire) {
    buttons.fire.hidden = !!Storage.data.mobileAutoFire;
  }
}

export function buildTouchControls(): HTMLElement {
  const root = document.createElement('div');
  root.className = 'touch-controls';
  // Built but inert on desktop. CSS also gates display on pointer:coarse.
  if (!isTouchDevice) {
    root.style.display = 'none';
    return root;
  }

  root.innerHTML = `
    <div class="touch-zone touch-zone--left"  data-role="left"  aria-hidden="true"></div>
    <div class="touch-zone touch-zone--right" data-role="right" aria-hidden="true"></div>
    <button class="touch-btn touch-btn--fire" type="button" aria-label="Fire" data-role="fire" hidden>
      <svg class="touch-btn__icon" viewBox="0 0 32 32" aria-hidden="true">
        <rect x="14" y="14" width="4" height="14" rx="1.5" fill="currentColor"/>
        <path d="M16 3 L7 14 L13 14 L13 18 L19 18 L19 14 L25 14 Z" fill="currentColor"/>
      </svg>
      <span class="touch-btn__label">FIRE</span>
    </button>
  `;

  buttons.left  = root.querySelector('[data-role="left"]')  as HTMLElement;
  buttons.right = root.querySelector('[data-role="right"]') as HTMLElement;
  buttons.fire  = root.querySelector('[data-role="fire"]')  as HTMLElement;

  // Zones trigger movement on contact; fire button triggers shooting.
  for (const id of ['left', 'right', 'fire'] as const) {
    const el = buttons[id]!;
    el.addEventListener('pointerdown', onPointerDown, { passive: false });
    el.addEventListener('contextmenu', e => e.preventDefault());
  }
  // Window listeners catch finger-slide and lost-touch cases regardless of
  // which element the pointer originally landed on.
  window.addEventListener('pointermove',   onPointerMove);
  window.addEventListener('pointerup',     releasePointer);
  window.addEventListener('pointercancel', releasePointer);
  // Tab-out / focus-loss: drop all internal state.
  window.addEventListener('blur', releaseAllTouchControls);
  // Page hidden (tab switch on mobile) is the same kind of event.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) releaseAllTouchControls();
  });

  applyTouchControlSettings();

  return root;
}
