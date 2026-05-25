/**
 * DOM touch controls — replaces renderTouchControls in src/systems/hud.ts.
 *
 * Buttons are real DOM elements so the browser's native pointer/touch
 * handling fires the correct events. We forward press/release to the
 * shared keys table so the rest of the game (which reads `keys['Space']`
 * etc) keeps working unchanged.
 */

import { keys, keysPressed, isTouchDevice } from '../../systems/input';

const heldByButton = { left: false, right: false, fire: false };

function press(id: 'left' | 'right' | 'fire') {
  if (heldByButton[id]) return;
  heldByButton[id] = true;
  const key = id === 'fire' ? 'Space' : id === 'left' ? 'ArrowLeft' : 'ArrowRight';
  if (!keys[key]) keysPressed[key] = true;
  keys[key] = true;
}
function release(id: 'left' | 'right' | 'fire') {
  if (!heldByButton[id]) return;
  heldByButton[id] = false;
  const key = id === 'fire' ? 'Space' : id === 'left' ? 'ArrowLeft' : 'ArrowRight';
  keys[key] = false;
}

function wireButton(btn: HTMLElement, id: 'left' | 'right' | 'fire') {
  const onDown = (e: Event) => { e.preventDefault(); btn.classList.add('is-held'); press(id); };
  const onUp   = (e: Event) => { e.preventDefault(); btn.classList.remove('is-held'); release(id); };
  // Use pointer events so a single code path handles touch + mouse + stylus.
  btn.addEventListener('pointerdown',  onDown);
  btn.addEventListener('pointerup',    onUp);
  btn.addEventListener('pointercancel',onUp);
  btn.addEventListener('pointerleave', onUp);
  btn.addEventListener('contextmenu',  e => e.preventDefault());
}

export function buildTouchControls(): HTMLElement {
  const root = document.createElement('div');
  root.className = 'touch-controls';
  // CSS handles the visibility (only shown on touch + during gameplay
  // states via body[data-state]), but we also early-return here on
  // desktop to avoid building unused DOM.
  if (!isTouchDevice) {
    root.style.display = 'none';
    return root;
  }

  root.innerHTML = `
    <button class="touch-btn touch-btn--left"  type="button" aria-label="Move left"  data-role="left">
      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M14 6l-8 6 8 6V6z"/></svg>
    </button>
    <button class="touch-btn touch-btn--right" type="button" aria-label="Move right" data-role="right">
      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 6l8 6-8 6V6z"/></svg>
    </button>
    <button class="touch-btn touch-btn--fire"  type="button" aria-label="Fire"      data-role="fire">
      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3l-7 9h4v9h6v-9h4z"/></svg>
      <span>FIRE</span>
    </button>
  `;

  wireButton(root.querySelector('[data-role="left"]') as HTMLElement,  'left');
  wireButton(root.querySelector('[data-role="right"]') as HTMLElement, 'right');
  wireButton(root.querySelector('[data-role="fire"]')  as HTMLElement, 'fire');

  return root;
}
