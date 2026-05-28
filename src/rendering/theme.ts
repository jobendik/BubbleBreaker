// =====================================================================
// CANVAS ART DIRECTION — single source of truth.
//
// The HTML/CSS overlay (menus / HUD / result cards) already shares one
// polished identity via src/styles/tokens.css. The procedural canvas layer
// historically drifted from it: raw `sans-serif` text, a half-dozen
// different "dark" outline colors, ad-hoc palette literals. That drift is
// what made the game read as if several hands built it.
//
// This module re-states the SAME design tokens the CSS uses so the gameplay
// layer renders as one designed product:
//
//   • INK            — one clean dark-navy outline for the whole roster
//   • PAL            — the brand palette (mirrors --brand-* in tokens.css)
//   • displayFont/uiFont — the exact two faces the UI uses (Bowlby One / Inter)
//   • inkText        — punchy outlined label, matching the HTML .fx-* labels
//
// The house style (from assets_needed.md / onAssets.md): "bright modern
// cartoon arcade, bold flat colors, clean dark outlines (~2px), subtle
// cel-shading with a single light source from the upper-left."
// =====================================================================

/** One dark-navy ink for every character / gameplay-object outline, so the
 *  whole cast shares a clean "sticker" silhouette. Mirrors --ink in CSS.
 *  (Element balls keep their own dark tone for material identity — that's a
 *  deliberate exception, not drift.) */
export const INK = '#0a1832';
export const INK_SOFT = 'rgba(10,24,50,0.55)';

/** Brand palette — mirrors the --brand-* tokens in src/styles/tokens.css.
 *  Use these instead of one-off hex literals so a palette tweak lands
 *  everywhere at once. */
export const PAL = {
  yellow:  '#ffd60a',
  coral:   '#ff7f50',
  pink:    '#ff4d6d',
  cyan:    '#9be7ff',
  mint:    '#06d6a0',
  violet:  '#9e7bff',
  white:   '#ffffff',
  // Supporting hues used across the gameplay layer (kept here so they're
  // shared, not re-typed per entity).
  magenta: '#ff36c4',
  blue:    '#3a86ff',
  orange:  '#fb5607',
  amber:   '#ffbe0b',
  steel:   '#dfe6ee',
  ember:   '#ff5400',
} as const;

// ---- Type system — mirrors --font-display / --font-ui in tokens.css --------
// Bowlby One: chunky single-weight display face for punchy labels (combos,
// +score popups, banners, pickup glyphs). Inter: grotesk for descriptive
// sentences. Both are already requested by index.html; loadFonts() forces
// them resident so canvas text uses the correct face from the very first
// gameplay frame — important because a first-time visitor is dropped straight
// into Level 1, skipping the menu that would otherwise warm the font cache.
const DISPLAY_STACK = "'Bowlby One', 'Trebuchet MS', 'Arial Black', sans-serif";
const UI_STACK = "'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif";

/** Display face (Bowlby One) at the given pixel size. */
export function displayFont(px: number): string {
  return `${Math.round(px)}px ${DISPLAY_STACK}`;
}

/** UI face (Inter) at the given pixel size + weight. */
export function uiFont(px: number, weight = 700): string {
  return `${weight} ${Math.round(px)}px ${UI_STACK}`;
}

let fontsKicked = false;
/** Force the two webfonts resident so the first canvas frame renders in the
 *  right face. Fire-and-forget: the rAF loop repaints once they resolve. */
export function loadFonts(): void {
  if (fontsKicked) return;
  fontsKicked = true;
  const fonts = (document as unknown as { fonts?: { load?: (f: string) => Promise<unknown> } }).fonts;
  if (!fonts?.load) return;
  try {
    fonts.load("1em 'Bowlby One'");
    fonts.load("400 1em 'Inter'");
    fonts.load("700 1em 'Inter'");
    fonts.load("800 1em 'Inter'");
  } catch { /* no-op — falls back to the stack above */ }
}

// ---- Color utilities ------------------------------------------------------
// Small helpers so every entity can cel-shade (lighten the lit face, darken
// the shadowed face) and pick a contrast-correct glyph color from ONE rule —
// the same way the CSS chips flip text to --ink on bright fills.

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** Perceived luminance 0..1 (Rec. 601 weights). */
export function relLuma(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/** Shade a hex color: amt > 0 lightens toward white, amt < 0 darkens toward
 *  black. Used for cel highlight/shadow faces from a single base color. */
export function shade(hex: string, amt: number): string {
  const { r, g, b } = hexToRgb(hex);
  const t = amt < 0 ? 0 : 255;
  const k = Math.min(1, Math.abs(amt));
  const m = (c: number) => Math.round(c + (t - c) * k);
  return `rgb(${m(r)},${m(g)},${m(b)})`;
}

/** True for bright fills that want a dark (ink) glyph/label instead of white —
 *  mirrors the .ui-chip--yellow / --mint convention in the CSS. */
export function isLight(hex: string): boolean {
  return relLuma(hex) > 0.58;
}

export interface InkTextOpts {
  font?: string;
  fill?: string;
  outline?: string;
  outlineWidth?: number;
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
  shadow?: boolean;
  alpha?: number;
}

/** A punchy label with a clean ink outline + fill — the canvas twin of the
 *  HTML `.fx-combo` / `.fx-score` text so in-world text matches the overlay.
 *  `lineJoin = round` keeps the heavy outline smooth (no spiky miters). */
export function inkText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  opts: InkTextOpts = {},
): void {
  const {
    font = displayFont(24),
    fill = PAL.yellow,
    outline = INK,
    outlineWidth = 4,
    align = 'center',
    baseline = 'alphabetic',
    shadow = true,
    alpha = 1,
  } = opts;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.font = font;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  if (shadow) {
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillText(text, x + 1, y + 2);
  }
  if (outlineWidth > 0) {
    ctx.lineWidth = outlineWidth;
    ctx.strokeStyle = outline;
    ctx.strokeText(text, x, y);
  }
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
  ctx.restore();
}
