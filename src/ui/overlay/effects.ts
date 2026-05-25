/**
 * Effects overlay — ephemeral DOM elements for juice (score popups,
 * combo chips, level-start banners, damage flashes, pickup bursts).
 *
 * The game pushes events here via the FX.* methods. Each call spawns
 * one element with an animation, registers a one-shot cleanup, and
 * removes the element when its animation ends. No pooling yet — the
 * burst rates are well under what the browser can comfortably handle
 * (peak ~10/sec during multi-pops), but a pool drop-in is easy if
 * profiling shows DOM churn.
 *
 * Coordinates are in canvas logical space (960×540). We convert to
 * percentages so the overlay scales with the stage's CSS box.
 */

import { W, H } from '../../constants';

let layer: HTMLElement | null = null;

export function initEffects(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'fx-layer';
  layer = el;
  return el;
}

function toPct(x: number, axis: 'x' | 'y'): string {
  const d = axis === 'x' ? W : H;
  return ((x / d) * 100).toFixed(2) + '%';
}

function spawn(el: HTMLElement, lifespanMs: number) {
  if (!layer) return;
  layer.appendChild(el);
  setTimeout(() => { el.remove(); }, lifespanMs);
}

export const FX = {
  /** "+150" rising and fading at the pop site. */
  score(x: number, y: number, value: number, variant: 'normal' | 'big' | 'mint' | 'pink' = 'normal') {
    const el = document.createElement('div');
    el.className = 'fx-score' + (variant !== 'normal' ? ' fx-score--' + variant : '');
    el.style.left = toPct(x, 'x');
    el.style.top  = toPct(y, 'y');
    el.textContent = '+' + value;
    spawn(el, 1000);
  },

  /** Combo chip label ("DOUBLE POP", "WILD!"). */
  combo(x: number, y: number, label: string, hot = false) {
    const el = document.createElement('div');
    el.className = 'fx-combo' + (hot ? ' fx-combo--hot' : '');
    el.style.left = toPct(x, 'x');
    el.style.top  = toPct(y, 'y');
    el.textContent = label;
    spawn(el, 1200);
  },

  /** Level-start banner — appears for ~3s then fades. */
  banner(title: string, sub = '') {
    const el = document.createElement('div');
    el.className = 'fx-banner';
    el.innerHTML = `
      <div class="fx-banner__title">${escapeHtml(title)}</div>
      ${sub ? `<span class="fx-banner__sub">${escapeHtml(sub)}</span>` : ''}
    `;
    spawn(el, 3300);
  },

  /** Full-screen red flash on damage. */
  damageFlash() {
    const el = document.createElement('div');
    el.className = 'fx-damage';
    spawn(el, 400);
  },

  /** Ring burst at a position — for pickup grabs / explosions. */
  burst(x: number, y: number, variant: 'yellow' | 'mint' | 'cyan' = 'yellow') {
    const el = document.createElement('div');
    el.className = 'fx-burst' + (variant !== 'yellow' ? ' fx-burst--' + variant : '');
    el.style.left = toPct(x, 'x');
    el.style.top  = toPct(y, 'y');
    spawn(el, 600);
  },
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => (
    c === '&' ? '&amp;' :
    c === '<' ? '&lt;'  :
    c === '>' ? '&gt;'  :
    c === '"' ? '&quot;' : '&#39;'
  ));
}
