/**
 * DOM touch controls — split-screen movement zones.
 *
 * Zone model:
 *   - Touching anywhere in the LEFT half of the stage moves the player left.
 *   - Touching anywhere in the RIGHT half moves the player right.
 *   - No on-screen buttons are shown for movement — the whole screen IS the
 *     control surface.
 *   - Shooting is handled entirely by auto-fire (input.ts).
 *
 * Multi-touch model:
 *   - pointerdown on a zone starts tracking that pointerId.
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
import { AudioSys } from '../../systems/audio';

type BtnId = 'left' | 'right';

const KEY_FOR: Record<BtnId, string> = {
  left:  'ArrowLeft',
  right: 'ArrowRight',
};

// `left` and `right` are invisible zone divs covering each half of the stage.
const buttons: Record<BtnId, HTMLElement | null> = { left: null, right: null };
const activePointer = new Map<number, BtnId | null>();
const held: Record<BtnId, boolean> = { left: false, right: false };

/** Return the x-coordinate that splits left from right zones (= stage centre).
 *  Derived from the right zone element so it tracks CSS layout exactly. */
function zoneSplitX(): number {
  if (buttons.right) return buttons.right.getBoundingClientRect().left;
  // Should never reach here after buildTouchControls() has run. Fallback to
  // viewport centre so hits are still processed correctly if it somehow does.
  if (import.meta.env.DEV) console.warn('[touchControls] zoneSplitX: buttons.right is null');
  return window.innerWidth / 2;
}

function hitTest(clientX: number, _clientY: number): BtnId | null {
  // Zone split: left half vs right half of the stage.
  return clientX < zoneSplitX() ? 'left' : 'right';
}

function applyHeld(next: Record<BtnId, boolean>) {
  for (const id of ['left', 'right'] as const) {
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
  const next: Record<BtnId, boolean> = { left: false, right: false };
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
  if (activePointer.size === 0 && !held.left && !held.right) return;
  activePointer.clear();
  applyHeld({ left: false, right: false });
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
  `;

  buttons.left  = root.querySelector('[data-role="left"]')  as HTMLElement;
  buttons.right = root.querySelector('[data-role="right"]') as HTMLElement;

  // Zones trigger movement on contact.
  for (const id of ['left', 'right'] as const) {
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

  return root;
}
