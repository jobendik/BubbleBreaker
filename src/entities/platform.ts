import { roundRect } from '../rendering/canvas';
import { INK, shade } from '../rendering/theme';
import type { ThemeName } from '../constants';

// ============================ PLATFORM ==============================
export interface PlatformOptions {
  blocksShots?: boolean;
  color?: string;
  vx?: number;
  minX?: number;
  maxX?: number;
}

export class Platform {
  x: number;
  y: number;
  w: number;
  h: number;
  blocksShots: boolean;
  color: string;
  vx: number;
  minX: number;
  maxX: number;
  constructor(x, y, w, h, opts: PlatformOptions = {}) {
    this.x = x; this.y = y; this.w = w; this.h = h;
    this.blocksShots = opts.blocksShots !== false;
    this.color = opts.color || '#7a5a3a';
    this.vx = opts.vx || 0;
    this.minX = opts.minX ?? x;
    this.maxX = opts.maxX ?? x;
  }
  update(dt) {
    if (!this.vx) return;
    this.x += this.vx * dt;
    if (this.x < this.minX) { this.x = this.minX; this.vx = Math.abs(this.vx); }
    if (this.x > this.maxX) { this.x = this.maxX; this.vx = -Math.abs(this.vx); }
  }
  draw(ctx, theme) {
    const { x, y, w, h } = this;
    // Cel-shaded ledge with the shared ink outline so platforms read as solid
    // stage props, not flat debug rectangles.
    let base = this.color;
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, shade(base, 0.34));
    g.addColorStop(0.5, base);
    g.addColorStop(1, shade(base, -0.3));
    ctx.fillStyle = g;
    roundRect(ctx, x, y, w, h, 5, true, false);
    // Top bevel highlight.
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    roundRect(ctx, x + 2, y + 2, w - 4, 2.5, 1.2, true, false);
    // Bottom contact shadow line.
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(x + 2, y + h - 2, w - 4, 2);
    // Ink outline.
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    roundRect(ctx, x, y, w, h, 5, false, true);
  }
}
