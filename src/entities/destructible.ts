import { roundRect } from '../rendering/canvas';
import { INK, shade } from '../rendering/theme';
import type { PickupType } from '../constants';

// ============================ DESTRUCTIBLE ==========================
export class Destructible {
  x: number;
  y: number;
  w: number;
  h: number;
  hp: number;
  contains: PickupType | null;
  dead: boolean;
  constructor(x, y, w, h, contains = null) {
    this.x = x; this.y = y; this.w = w; this.h = h;
    this.hp = 1;
    this.contains = contains;  // pickup type to drop, or null
    this.dead = false;
  }
  draw(ctx) {
    const { x, y, w, h } = this;
    const WOOD = '#b8742f';
    // Cel-shaded wood body (lit top-left → shadowed bottom-right) with the
    // shared 2px ink outline, so the crate matches the cartoon roster.
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, shade(WOOD, 0.32));
    g.addColorStop(0.5, WOOD);
    g.addColorStop(1, shade(WOOD, -0.3));
    ctx.fillStyle = g;
    roundRect(ctx, x, y, w, h, 4, true, false);

    // Plank seams + corner braces in a darker wood tone — reads as a crate,
    // not a plain box.
    ctx.save();
    ctx.strokeStyle = shade(WOOD, -0.42);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y + h / 2); ctx.lineTo(x + w, y + h / 2);
    ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w / 2, y + h);
    ctx.stroke();
    // Diagonal brace.
    ctx.beginPath();
    ctx.moveTo(x + 2, y + h - 2); ctx.lineTo(x + w - 2, y + 2);
    ctx.stroke();
    ctx.restore();

    // Top edge highlight for the upper-left light source.
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    roundRect(ctx, x + 3, y + 2, w - 6, 3, 1.5, true, false);

    // Contents hint — a soft glimmer when the crate holds a pickup.
    if (this.contains) {
      const pulse = 0.5 + Math.abs(Math.sin(performance.now() / 360)) * 0.5;
      ctx.save();
      ctx.globalAlpha = 0.22 + pulse * 0.22;
      ctx.fillStyle = '#ffd60a';
      ctx.beginPath();
      ctx.arc(x + w / 2, y + h / 2, Math.min(w, h) * 0.22, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    roundRect(ctx, x, y, w, h, 4, false, true);
  }
}
