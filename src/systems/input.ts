import { AudioSys } from './audio';
import { H, State, W, type GameState } from '../constants';
import { Storage } from './storage';
import type { Game } from '../game';

// ============================ INPUT =================================
export const keys: Record<string, boolean> = {};        // currently held
export const keysPressed: Record<string, boolean> = {}; // single-frame edge triggers

// Pointer (mouse/touch) state. Coordinates are in canvas logical space (W x H).
export const pointer = {
  x: 0,
  y: 0,
  down: false,
  pressed: false,        // single-frame edge trigger (consume with consumePointer)
  pressedX: 0,
  pressedY: 0,
};

// Touch device detection: true if the device reports any touch capability.
// A hybrid laptop with both touch and keyboard will be classified as touch — we
// accept this and let the controls be visible.
export const isTouchDevice =
  typeof window !== 'undefined' &&
  (('ontouchstart' in window) || (navigator.maxTouchPoints || 0) > 0);

let canvasEl: HTMLCanvasElement | null = null;

// Auto-fire ownership tracking. Declared up here so the window.blur handler
// (further down) can clear it without hitting the TDZ.
let _autoFireActive = false;

const GAMEPAD_AXIS_DEADZONE = 0.35;
const gamepadKeyState: Record<string, boolean> = {
  ArrowLeft: false,
  ArrowRight: false,
  ArrowUp: false,
  ArrowDown: false,
  Space: false,
  Escape: false,
  KeyP: false,
  KeyR: false,
  KeyM: false,
};

function applySyntheticKey(code: string, held: boolean, sourceState: Record<string, boolean>) {
  if (held) {
    if (!keys[code]) keysPressed[code] = true;
    keys[code] = true;
    sourceState[code] = true;
  } else if (sourceState[code]) {
    keys[code] = false;
    sourceState[code] = false;
  }
}

function releaseSyntheticKeys(sourceState: Record<string, boolean>) {
  for (const code in sourceState) applySyntheticKey(code, false, sourceState);
}

function getPrimaryGamepad(): Gamepad | null {
  if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return null;
  const pads = navigator.getGamepads();
  for (let i = 0; i < pads.length; i++) {
    const pad = pads[i];
    if (pad?.connected) return pad;
  }
  return null;
}

function toCanvasCoords(clientX: number, clientY: number) {
  if (!canvasEl) return { x: 0, y: 0 };
  const rect = canvasEl.getBoundingClientRect();
  const scaleX = W / rect.width;
  const scaleY = H / rect.height;
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY,
  };
}

/** Bind pointer/touch events to the game canvas. Called once at startup from
 *  main.ts. Maintains the `pointer` struct used by menu hit-tests and the
 *  intro-dismiss path. Touch button input is owned by the DOM controls in
 *  src/ui/hud/touchControls.html.ts — that path runs over the top of these
 *  listeners since the buttons sit above the canvas with pointer-events: auto. */
export function bindCanvasInput(canvas: HTMLCanvasElement) {
  canvasEl = canvas;
  // Prevent iOS double-tap zoom and rubber-band scroll on the canvas surface.
  canvas.style.touchAction = 'none';

  canvas.addEventListener('mousemove', e => {
    const p = toCanvasCoords(e.clientX, e.clientY);
    pointer.x = p.x; pointer.y = p.y;
  });
  canvas.addEventListener('mousedown', e => {
    const p = toCanvasCoords(e.clientX, e.clientY);
    pointer.x = p.x; pointer.y = p.y;
    pointer.pressedX = p.x; pointer.pressedY = p.y;
    pointer.down = true; pointer.pressed = true;
    AudioSys.init();
  });
  window.addEventListener('mouseup', () => { pointer.down = false; });

  const syncFromTouchList = (touchList: TouchList) => {
    // Mirror the most recent touch into `pointer` so menus / on-canvas
    // hit-tests keep working with the same code path as mouse clicks.
    if (touchList.length === 0) return;
    const t = touchList[touchList.length - 1];
    const p = toCanvasCoords(t.clientX, t.clientY);
    pointer.x = p.x; pointer.y = p.y;
  };

  canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      const p = toCanvasCoords(t.clientX, t.clientY);
      pointer.x = p.x; pointer.y = p.y;
      pointer.pressedX = p.x; pointer.pressedY = p.y;
      pointer.down = true; pointer.pressed = true;
    }
    syncFromTouchList(e.targetTouches);
    AudioSys.init();
  }, { passive: false });
  canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    syncFromTouchList(e.targetTouches);
  }, { passive: false });
  canvas.addEventListener('touchend', e => {
    e.preventDefault();
    syncFromTouchList(e.targetTouches);
    if (e.targetTouches.length === 0) pointer.down = false;
  }, { passive: false });
  canvas.addEventListener('touchcancel', e => {
    syncFromTouchList(e.targetTouches);
    if (e.targetTouches.length === 0) pointer.down = false;
  });
}

window.addEventListener('keydown', e => {
  if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) e.preventDefault();
  if (!keys[e.code]) keysPressed[e.code] = true;
  keys[e.code] = true;
  AudioSys.init(); // user gesture unlocks audio
});
window.addEventListener('keyup', e => { keys[e.code] = false; });
window.addEventListener('blur', () => {
  for (const k in keys) keys[k] = false;
  pointer.down = false;
  _autoFireActive = false;
  // Touch controls have their own blur recovery in touchControls.html.ts —
  // they listen on window pointerup which fires during a tab-out blur.
});

// ---- Mobile zoom suppression ------------------------------------------------
// iOS Safari ignores the `user-scalable=no` viewport flag, so double-tap-to-zoom
// and pinch-zoom still fire on top of the game. Because the player taps rapidly
// to move, the screen kept zooming in mid-game. `touch-action: manipulation`
// (set in base.css) kills the double-tap zoom on compliant browsers; these
// listeners are the belt-and-suspenders path for iOS Safari, which needs an
// explicit preventDefault on its non-standard gesture events and on the second
// tap of a rapid pair. Interactive HTML controls (pause, menu buttons) are
// exempted so their tap → synthetic click still fires.
if (typeof document !== 'undefined') {
  const stopGesture = (e: Event) => e.preventDefault();
  for (const evt of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(evt, stopGesture, { passive: false });
  }
  let lastTouchEnd = 0;
  document.addEventListener('touchend', (e: TouchEvent) => {
    const now = Date.now();
    const target = e.target as HTMLElement | null;
    const interactive = !!target?.closest('button, a, input, select, textarea, [role="button"]');
    if (now - lastTouchEnd <= 300 && !interactive) e.preventDefault();
    lastTouchEnd = now;
  }, { passive: false });
  document.addEventListener('dblclick', (e: MouseEvent) => {
    const target = e.target as HTMLElement | null;
    if (!target?.closest('button, a, input, select, textarea, [role="button"]')) e.preventDefault();
  }, { passive: false });
}

export function consumePressed(code: string) {
  if (keysPressed[code]) { keysPressed[code] = false; return true; }
  return false;
}

/** Consume a single-frame click/tap. Returns true once per press. */
export function consumePointer() {
  if (pointer.pressed) { pointer.pressed = false; return true; }
  return false;
}

/** Returns true if any meaningful "go" input fired this frame: Enter/Space/click/tap. */
export function consumeAnyConfirm() {
  if (consumePointer()) return true;
  if (consumePressed('Enter')) return true;
  if (consumePressed('Space')) return true;
  return false;
}

/** Returns true if ANY key was pressed this frame, or pointer clicked. Use sparingly. */
export function consumeAnyInput() {
  if (consumePointer()) return true;
  for (const k in keysPressed) {
    if (keysPressed[k]) { keysPressed[k] = false; return true; }
  }
  return false;
}

/** Rect hit test against the most recent pointer-down position. */
export function pointerHit(x: number, y: number, w: number, h: number) {
  return pointer.pressedX >= x && pointer.pressedX <= x + w
      && pointer.pressedY >= y && pointer.pressedY <= y + h;
}

/** Rect hover test against current pointer position. As a side effect, records
 *  the hovered rect so flushHoverSound() (called once per render frame) can
 *  fire a single hover SFX when the cursor crosses into a different button. */
export function pointerOver(x: number, y: number, w: number, h: number) {
  const over = pointer.x >= x && pointer.x <= x + w
            && pointer.y >= y && pointer.y <= y + h;
  if (over) _frameHoverKey = x + ',' + y + ',' + w + ',' + h;
  return over;
}

let _frameHoverKey: string | null = null;
let _lastHoverKey: string | null = null;

/** Call once per render frame, after the state's draw runs. Fires AudioSys.hover()
 *  on the frame the cursor transitions onto a new button (or back onto one after
 *  leaving). No-op on touch / when nothing is hovered. */
export function flushHoverSound() {
  if (_frameHoverKey && _frameHoverKey !== _lastHoverKey) {
    AudioSys.hover();
  }
  _lastHoverKey = _frameHoverKey;
  _frameHoverKey = null;
}

/**
 * When auto-fire is active, this module drives `keys.Space = true`. When it
 * deactivates (state change, setting flip, player dies, onboarding overlay
 * shown), we release Space only if auto-fire was the one holding it down —
 * never stomp on a manual keypress.
 */
/**
 * Mobile-only auto-fire driver. Called once per frame from game.update().
 *
 * Active iff: touch device AND user opted in (Storage.mobileAutoFire)
 *          AND state === PLAYING
 *          AND there is a live (non-dead) player
 *          AND the intro banner has dismissed
 *          AND the first-play onboarding overlay has been seen.
 *
 * Last condition matters: we don't want the player's harpoon firing into
 * the ceiling while the "tap LEFT/RIGHT to move" overlay is still up.
 */
export function tickAutoFire(game: Game) {
  const active =
    isTouchDevice &&
    !!Storage.data.mobileAutoFire &&
    game.state === State.PLAYING &&
    !!game.player &&
    !game.player.dead &&
    game.introTimer <= 0 &&
    !!Storage.data.mobileOnboardingSeen;

  if (active) {
    if (!keys['Space']) keysPressed['Space'] = true;
    keys['Space'] = true;
    _autoFireActive = true;
  } else if (_autoFireActive) {
    // We previously owned Space; release it now. Manual fire (DOM Fire
    // button, keyboard Space) will set keys.Space = true again on its
    // own this frame or the next.
    keys['Space'] = false;
    _autoFireActive = false;
  }
}

/** Poll the browser Gamepad API and synthesize the keyboard codes the rest of
 *  the game already understands. This keeps controller support centralized in
 *  one place instead of teaching every game state about buttons. */
export function tickGamepadInputs(state: GameState) {
  const pad = getPrimaryGamepad();
  if (!pad) {
    releaseSyntheticKeys(gamepadKeyState);
    return;
  }

  const axisX = pad.axes[0] ?? 0;
  const axisY = pad.axes[1] ?? 0;
  const horizontalLeft = axisX <= -GAMEPAD_AXIS_DEADZONE || !!pad.buttons[14]?.pressed;
  const horizontalRight = axisX >= GAMEPAD_AXIS_DEADZONE || !!pad.buttons[15]?.pressed;
  const verticalEnabled = state !== State.PLAYING;
  const verticalUp = verticalEnabled && (axisY <= -GAMEPAD_AXIS_DEADZONE || !!pad.buttons[12]?.pressed);
  const verticalDown = verticalEnabled && (axisY >= GAMEPAD_AXIS_DEADZONE || !!pad.buttons[13]?.pressed);

  applySyntheticKey('ArrowLeft', horizontalLeft && !horizontalRight, gamepadKeyState);
  applySyntheticKey('ArrowRight', horizontalRight && !horizontalLeft, gamepadKeyState);
  applySyntheticKey('ArrowUp', verticalUp && !verticalDown, gamepadKeyState);
  applySyntheticKey('ArrowDown', verticalDown && !verticalUp, gamepadKeyState);

  // Standard-mapped PS5/DualSense buttons in browsers:
  // Cross = 0, Circle = 1, Square = 2, Triangle = 3, Options = 9.
  applySyntheticKey('Space', !!pad.buttons[0]?.pressed, gamepadKeyState);
  applySyntheticKey('Escape', !!pad.buttons[1]?.pressed, gamepadKeyState);
  applySyntheticKey('KeyR', !!pad.buttons[2]?.pressed, gamepadKeyState);
  applySyntheticKey('KeyM', !!pad.buttons[3]?.pressed, gamepadKeyState);
  applySyntheticKey('KeyP', !!pad.buttons[9]?.pressed, gamepadKeyState);

  if (
    horizontalLeft || horizontalRight || verticalUp || verticalDown
    || pad.buttons[0]?.pressed || pad.buttons[1]?.pressed || pad.buttons[2]?.pressed
    || pad.buttons[3]?.pressed || pad.buttons[9]?.pressed
  ) {
    AudioSys.init();
  }
}

