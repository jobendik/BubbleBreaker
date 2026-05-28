import { GROUND_Y, WALL_L, WALL_R } from '../constants';
import { INK, shade } from '../rendering/theme';

export class Crab {
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  minX: number;
  maxX: number;
  dead: boolean;

  constructor(x: number, y = GROUND_Y, minX = WALL_L + 30, maxX = WALL_R - 30, speed = 72) {
    this.x = x;
    this.y = y;
    this.w = 34;
    this.h = 18;
    this.vx = speed;
    this.minX = minX;
    this.maxX = maxX;
    this.dead = false;
  }

  getHitbox() {
    return { x: this.x - this.w / 2, y: this.y - this.h, w: this.w, h: this.h };
  }

  update(dt: number) {
    this.x += this.vx * dt;
    if (this.x < this.minX) { this.x = this.minX; this.vx = Math.abs(this.vx); }
    if (this.x > this.maxX) { this.x = this.maxX; this.vx = -Math.abs(this.vx); }
  }

  draw(ctx: CanvasRenderingContext2D) {
    const dir = Math.sign(this.vx) || 1;
    const SHELL = '#f4691f';      // coral-orange, sits beside PAL.coral/orange
    const step = Math.sin(this.x * 0.18);   // scuttle phase from position
    ctx.save();
    ctx.translate(this.x, this.y);

    // Contact shadow — grounds the crab like every other entity.
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(0, 1, 16, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // Legs — three per side, scuttling in counter-phase.
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    for (let i = -1; i <= 1; i++) {
      const wig = Math.sin(this.x * 0.18 + i) * 2;
      ctx.beginPath(); ctx.moveTo(i * 7 - 6, -5); ctx.lineTo(i * 9 - 13, -1 + wig); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(i * 7 + 6, -5); ctx.lineTo(i * 9 + 13, -1 - wig); ctx.stroke();
    }

    // Claws — chunky pincers with the shared ink outline + cel highlight.
    for (const s of [-1, 1]) {
      const lift = s === dir ? step * 1.6 : -step * 1.6;
      ctx.save();
      ctx.translate(s * 22, -14 + lift);
      ctx.fillStyle = shade(SHELL, -0.1);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-s * 9, 5); ctx.lineTo(0, 2); ctx.stroke();   // arm
      ctx.beginPath();
      ctx.ellipse(0, 0, 6, 5, 0, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      // Pincer split.
      ctx.beginPath();
      ctx.moveTo(s * 6, -2); ctx.lineTo(s * 1, 0); ctx.lineTo(s * 6, 2);
      ctx.stroke();
      ctx.restore();
    }

    // Shell — cel-shaded dome.
    const g = ctx.createLinearGradient(0, -20, 0, -2);
    g.addColorStop(0, shade(SHELL, 0.4));
    g.addColorStop(0.55, SHELL);
    g.addColorStop(1, shade(SHELL, -0.28));
    ctx.fillStyle = g;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, -11, 15, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Shell seam highlight.
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(-3, -13, 8, 4, -0.3, Math.PI * 0.9, Math.PI * 1.7);
    ctx.stroke();

    // Eye stalks + eyes (player-style: ink pupil with a white sparkle).
    ctx.strokeStyle = INK; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-6, -17); ctx.lineTo(-6, -21); ctx.moveTo(6, -17); ctx.lineTo(6, -21); ctx.stroke();
    for (const ex of [-6, 6]) {
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(ex, -22, 3, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = INK; ctx.lineWidth = 1.4; ctx.stroke();
      ctx.fillStyle = INK;
      ctx.beginPath(); ctx.arc(ex + dir * 0.8, -22, 1.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(ex + dir * 0.4, -22.6, 0.7, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
}
