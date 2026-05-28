import { clamp } from '../utils';
import { INK, displayFont, uiFont } from '../rendering/theme';

// ============================ PARTICLES =============================
export class Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  gravity: number;
  dead: boolean;
  constructor(x, y, vx, vy, life, color, size = 4, gravity = 0) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.life = life; this.maxLife = life;
    this.color = color; this.size = size; this.gravity = gravity;
    this.dead = false;
  }
  update(dt) {
    this.vy += this.gravity * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
  }
  draw(ctx: CanvasRenderingContext2D) {
    const a = clamp(this.life / this.maxLife, 0, 1);
    const r = this.size * a * 0.6 + 1;
    // Soft glow halo (faint, large) + bright core (small). Reads as a
    // glowing spark rather than a sharp pixel — instantly more premium.
    ctx.save();
    ctx.globalAlpha = a * 0.45;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, r * 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = a;
    ctx.beginPath();
    ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
    ctx.fill();
    // Tiny white core for hot center on fresh particles.
    if (a > 0.6) {
      ctx.globalAlpha = (a - 0.6) * 1.5;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(this.x, this.y, r * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

export class FloatingText {
  x: number;
  y: number;
  text: string;
  color: string;
  size: number;
  life: number;
  maxLife: number;
  dead: boolean;
  /** 'display' = Bowlby One (punchy labels: combos, +score), 'ui' = Inter
   *  (descriptive sentences). Matches the HTML overlay's split so in-world
   *  text reads in the same faces as the menus / HUD. */
  face: 'display' | 'ui';
  constructor(x, y, text, color = '#fff', size = 22, face: 'display' | 'ui' = 'display') {
    this.x = x; this.y = y; this.text = text; this.color = color;
    this.size = size; this.life = 1.0; this.maxLife = 1.0;
    this.dead = false;
    this.face = face;
  }
  update(dt) {
    this.y -= 40 * dt;
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
  }
  draw(ctx: CanvasRenderingContext2D) {
    const a = clamp(this.life / this.maxLife, 0, 1);
    // Pop-in scale: starts big, settles to 1.0 over the first 150ms of life.
    const age = 1 - a;
    const pop = age < 0.15 ? 1.6 - age * 4 : 1.0;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.scale(pop, pop);
    ctx.globalAlpha = a;
    // Brand faces (not raw sans-serif) so combo / score / banner text matches
    // the HTML .fx-* labels exactly. Ink outline (not pure black) keeps the
    // whole game's text on one palette.
    ctx.font = this.face === 'ui' ? uiFont(this.size, 800) : displayFont(this.size);
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    // Soft drop shadow for depth.
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillText(this.text, 1, 2);
    ctx.lineWidth = Math.max(3, this.size * 0.16);
    ctx.strokeStyle = INK;
    ctx.strokeText(this.text, 0, 0);
    ctx.fillStyle = this.color;
    ctx.fillText(this.text, 0, 0);
    ctx.restore();
  }
}

/** Expanding radial ring used as pop / explosion flash. Lives briefly, draws
 *  as a fading circle outline so it reads as "impact at this point" without
 *  obscuring the rest of the scene. */
export class Shockwave {
  x: number;
  y: number;
  r: number;
  maxR: number;
  life: number;
  maxLife: number;
  color: string;
  dead: boolean;
  constructor(x: number, y: number, maxR = 60, color = '#ffffff', life = 0.28) {
    this.x = x; this.y = y;
    this.r = 0; this.maxR = maxR;
    this.life = life; this.maxLife = life;
    this.color = color; this.dead = false;
  }
  update(dt: number) {
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
    const t = 1 - this.life / this.maxLife;
    // Ease-out: fast growth at first, slowing toward maxR.
    this.r = this.maxR * (1 - Math.pow(1 - t, 2));
  }
  draw(ctx: CanvasRenderingContext2D) {
    const a = clamp(this.life / this.maxLife, 0, 1);
    ctx.save();
    ctx.globalAlpha = a * 0.75;
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 3 * a + 1;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
    ctx.stroke();
    // Inner bright flash early in the lifetime
    if (a > 0.6) {
      ctx.globalAlpha = (a - 0.6) * 2;
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r * 0.35, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

export class SmokeCloud {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
  maxLife: number;
  dead: boolean;

  constructor(x, y, r = 38, life = 3.2) {
    this.x = x;
    this.y = y;
    this.vx = (Math.random() * 2 - 1) * 14;
    this.vy = -10 - Math.random() * 10;
    this.r = r;
    this.life = life;
    this.maxLife = life;
    this.dead = false;
  }

  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.r += 6 * dt;
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
  }

  draw(ctx) {
    const a = clamp(this.life / this.maxLife, 0, 1);
    ctx.save();
    ctx.globalAlpha = 0.28 * a;
    const grad = ctx.createRadialGradient(this.x, this.y, this.r * 0.1, this.x, this.y, this.r);
    grad.addColorStop(0, '#d8dee6');
    grad.addColorStop(0.7, '#8d99a6');
    grad.addColorStop(1, 'rgba(80,85,92,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
