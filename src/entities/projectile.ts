import { CEILING_Y, WALL_L, WALL_R } from '../constants';
import { clamp, rand } from '../utils';
import { roundRect } from '../rendering/canvas';
import { INK, PAL } from '../rendering/theme';
import type { Ball } from './ball';
import type { Player } from './player';
import type { Game } from '../game';

/** Shared barbed harpoon head, pointing straight up, tip at (x, tipY). Used by
 *  the harpoon, the (travelling) power wire, so every spear in the game has the
 *  same steel-with-gold, ink-outlined silhouette. */
function drawSpearhead(ctx: CanvasRenderingContext2D, x: number, tipY: number, accent: string = PAL.yellow) {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.fillStyle = '#e9eef5';      // steel
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, tipY - 10);       // sharp point
  ctx.lineTo(x + 5, tipY - 1);    // right shoulder
  ctx.lineTo(x + 7, tipY + 8);    // right barb
  ctx.lineTo(x + 2, tipY + 3);    // inner notch
  ctx.lineTo(x + 2, tipY + 1);
  ctx.lineTo(x - 2, tipY + 1);
  ctx.lineTo(x - 2, tipY + 3);
  ctx.lineTo(x - 7, tipY + 8);    // left barb
  ctx.lineTo(x - 5, tipY - 1);    // left shoulder
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Gold accent near the point + a specular glint.
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.moveTo(x, tipY - 8); ctx.lineTo(x + 2.4, tipY - 2); ctx.lineTo(x - 2.4, tipY - 2);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillRect(x - 3.4, tipY - 1, 1.4, 5);
  ctx.restore();
}

// ============================ PROJECTILE ============================
// 'grapple'  — Power Wire: once the tip reaches the ceiling, the wire anchors
//              and persists until struck by a ball (a passive defensive trap).
// 'diagonal' — Sheila-style 45-degree harpoon. Behaves like a linear projectile,
//              not an anchored wire, so it can hit balls without standing under them.
export type ProjectileType = 'harpoon' | 'bullet' | 'pellet' | 'laser' | 'flame'
  | 'shuriken' | 'bomb' | 'grapple' | 'diagonal';

export class Projectile {
  x: number;
  y: number;
  type: ProjectileType;
  owner: Player;
  dead: boolean;
  didHit: boolean;
  hitBalls: Set<Ball>;
  startY: number;
  tipY: number;
  speed: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  life: number;
  r: number;
  spin: number;
  bounces: number;
  explosionRadius: number;
  /** For 'grapple' (Power Wire) — true once the tip has reached the ceiling
   *  and the wire is locked in place. Once anchored, the projectile waits
   *  passively for a ball to collide with it instead of advancing. */
  anchored: boolean;
  /** Persistence timer used while anchored. Caps the trap so the screen
   *  doesn't fill with grapples; 0 means "live indefinitely until struck." */
  anchorLife: number;
  /** Diagonal-harpoon angle from vertical, used so we can fire two mirrored
   *  shots from a single weapon and render the cable along the actual path. */
  dirX: number;
  dirY: number;
  constructor(x, y, type, owner, dirX = 0, dirY = -1) {
    this.x = x; this.y = y; this.type = type; this.owner = owner;
    this.dead = false;
    this.didHit = false;
    this.hitBalls = new Set();  // for piercing weapons
    this.spin = 0;
    this.bounces = 0;
    this.explosionRadius = 0;
    this.anchored = false;
    this.anchorLife = 0;
    this.dirX = dirX;
    this.dirY = dirY;

    if (type === 'harpoon') {
      this.startY = y;
      this.tipY = y;
      this.speed = 1150;
      this.w = 6;
    } else if (type === 'bullet') {
      this.vx = 0; this.vy = -900; this.w = 5; this.h = 12;
    } else if (type === 'pellet') {
      this.vx = 0; this.vy = -900; this.w = 4; this.h = 8;
    } else if (type === 'laser') {
      this.tipY = CEILING_Y;
      this.startY = y;
      this.w = 16;
      this.life = 0.2;
    } else if (type === 'flame') {
      this.vy = -380 - rand(0, 60);
      this.vx = rand(-30, 30);
      this.life = 0.4;
      this.r = 14;
    } else if (type === 'shuriken') {
      this.vx = owner.facing * 85;
      this.vy = -760;
      this.w = 18;
      this.h = 18;
      this.r = 10;
      this.life = 2.8;
      this.bounces = 1;
    } else if (type === 'bomb') {
      this.vx = owner.facing * 45;
      this.vy = -620;
      this.r = 8;
      this.life = 2.4;
      this.explosionRadius = 92;
    } else if (type === 'grapple') {
      // Behaves like a harpoon while travelling; once tip hits the ceiling we
      // flip `anchored = true` and the wire stays put until a ball hits it.
      this.startY = y;
      this.tipY = y;
      this.speed = 1050;
      this.w = 6;
      this.anchorLife = 14;             // hard cap: 14s anchored before fading
    } else if (this.type === 'diagonal') {
      // Linear travelling shot along (dirX, dirY). Diagonal harpoons are short
      // bolts rather than ceiling-anchored cables.
      this.w = 6;
      this.h = 12;
      this.speed = 980;
      this.vx = dirX * this.speed;
      this.vy = dirY * this.speed;
    }
  }

  update(dt, game) {
    if (this.type === 'harpoon') {
      this.tipY -= this.speed * dt;
      if (this.tipY <= CEILING_Y) this.dead = true;
      // Hits platforms? Treat solid platforms as walls.
      for (const p of game.platforms) {
        if (p.blocksShots && this.x >= p.x && this.x <= p.x + p.w && this.tipY <= p.y + p.h && this.tipY >= p.y) {
          this.dead = true;
          break;
        }
      }
    } else if (this.type === 'bullet' || this.type === 'pellet') {
      this.x += (this.vx || 0) * dt;
      this.y += this.vy * dt;
      if (this.y < CEILING_Y || this.x < WALL_L || this.x > WALL_R) this.dead = true;
    } else if (this.type === 'laser') {
      this.life -= dt;
      if (this.life <= 0) this.dead = true;
    } else if (this.type === 'flame') {
      this.life -= dt;
      this.y += this.vy * dt;
      this.x += this.vx * dt;
      this.vy += 100 * dt; // deceleration
      this.r += 30 * dt;
      if (this.life <= 0 || this.y < CEILING_Y) this.dead = true;
    } else if (this.type === 'shuriken') {
      this.life -= dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.spin += dt * 18;
      if ((this.x < WALL_L || this.x > WALL_R) && this.bounces > 0) {
        this.x = clamp(this.x, WALL_L, WALL_R);
        this.vx *= -1;
        this.bounces--;
      }
      if (this.y <= CEILING_Y && this.bounces > 0) {
        this.y = CEILING_Y;
        this.vy = Math.abs(this.vy) * 0.75;
        this.bounces--;
      }
      if (this.life <= 0 || this.y > game.canvas.height || this.y < CEILING_Y - 30 || this.x < WALL_L - 30 || this.x > WALL_R + 30) this.dead = true;
    } else if (this.type === 'bomb') {
      this.life -= dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.vy += 520 * dt;
      if (this.y <= CEILING_Y || this.life <= 0) game.explodeProjectile(this, this.x, this.y);
      else if (this.y > game.canvas.height) this.dead = true;
    } else if (this.type === 'grapple') {
      if (!this.anchored) {
        this.tipY -= this.speed * dt;
        if (this.tipY <= CEILING_Y) {
          this.tipY = CEILING_Y;
          this.anchored = true;
        }
        for (const p of game.platforms) {
          if (p.blocksShots && this.x >= p.x && this.x <= p.x + p.w
              && this.tipY <= p.y + p.h && this.tipY >= p.y) {
            this.tipY = p.y + p.h;
            this.anchored = true;
            break;
          }
        }
      } else {
        // Persistence countdown while anchored. Fades visually in draw().
        this.anchorLife -= dt;
        if (this.anchorLife <= 0) this.dead = true;
      }
    } else if (this.type === 'diagonal') {
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      // Light gravity so the bolt arcs slightly — sells the "thrown" feel.
      this.vy += 220 * dt;
      if (this.y < CEILING_Y || this.x < WALL_L || this.x > WALL_R || this.y > game.canvas.height) {
        this.dead = true;
      }
    }
  }

  /** Test whether this projectile overlaps a ball. */
  hits(ball) {
    if (this.dead) return false;
    if (this.hitBalls.has(ball)) return false;
    if (this.type === 'harpoon') {
      // Vertical line from tipY to startY at x ± w/2
      if (ball.x + ball.r < this.x - this.w/2) return false;
      if (ball.x - ball.r > this.x + this.w/2) return false;
      if (ball.y + ball.r < this.tipY) return false;
      if (ball.y - ball.r > this.startY) return false;
      return true;
    }
    if (this.type === 'laser') {
      if (ball.x + ball.r < this.x - this.w/2) return false;
      if (ball.x - ball.r > this.x + this.w/2) return false;
      if (ball.y + ball.r < this.tipY) return false;
      if (ball.y - ball.r > this.startY) return false;
      return true;
    }
    if (this.type === 'bullet' || this.type === 'pellet') {
      return ball.x - ball.r < this.x + this.w/2 && ball.x + ball.r > this.x - this.w/2
          && ball.y - ball.r < this.y + (this.h||10) && ball.y + ball.r > this.y;
    }
    if (this.type === 'flame') {
      const dx = ball.x - this.x, dy = ball.y - this.y;
      return Math.sqrt(dx*dx + dy*dy) < ball.r + this.r;
    }
    if (this.type === 'shuriken' || this.type === 'bomb') {
      const dx = ball.x - this.x, dy = ball.y - this.y;
      return Math.sqrt(dx*dx + dy*dy) < ball.r + this.r;
    }
    if (this.type === 'grapple') {
      // Identical hit geometry to harpoon — the vertical wire segment.
      if (ball.x + ball.r < this.x - this.w/2) return false;
      if (ball.x - ball.r > this.x + this.w/2) return false;
      if (ball.y + ball.r < this.tipY) return false;
      if (ball.y - ball.r > this.startY) return false;
      return true;
    }
    if (this.type === 'diagonal') {
      const dx = ball.x - this.x, dy = ball.y - this.y;
      return Math.sqrt(dx*dx + dy*dy) < ball.r + 8;
    }
    return false;
  }

  /** Most projectiles consume themselves on hit; laser/flame pierce.
   *  Grapples are consumed on hit too (the wire breaks), matching arcade Pang. */
  consumeOnHit() {
    return !(this.type === 'laser' || this.type === 'flame' || this.type === 'shuriken');
  }

  draw(ctx) {
    if (this.type === 'harpoon') {
      // Wire — an ink-edged cable with a warm metallic core (not a bare line),
      // capped by the shared barbed steel spearhead.
      ctx.save();
      ctx.lineCap = 'round';
      ctx.strokeStyle = INK;
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(this.x, this.startY); ctx.lineTo(this.x, this.tipY + 2); ctx.stroke();
      ctx.strokeStyle = '#ffe28a';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(this.x, this.startY); ctx.lineTo(this.x, this.tipY + 2); ctx.stroke();
      ctx.restore();
      drawSpearhead(ctx, this.x, this.tipY);
    } else if (this.type === 'bullet') {
      ctx.fillStyle = '#fff7ad';
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.4;
      roundRect(ctx, this.x - this.w / 2, this.y, this.w, this.h, 2, true, true);
    } else if (this.type === 'pellet') {
      ctx.fillStyle = PAL.amber;
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.2;
      roundRect(ctx, this.x - this.w / 2, this.y, this.w, this.h, 2, true, true);
    } else if (this.type === 'laser') {
      const a = clamp(this.life / 0.2, 0, 1);
      ctx.save();
      ctx.globalAlpha = a;
      // Outer glow → magenta beam → hot white core.
      ctx.fillStyle = 'rgba(255,54,196,0.35)';
      ctx.fillRect(this.x - this.w / 2 - 3, this.tipY, this.w + 6, this.startY - this.tipY);
      ctx.fillStyle = PAL.magenta;
      ctx.fillRect(this.x - this.w / 2, this.tipY, this.w, this.startY - this.tipY);
      ctx.fillStyle = '#fff';
      ctx.fillRect(this.x - 3, this.tipY, 6, this.startY - this.tipY);
      ctx.restore();
    } else if (this.type === 'flame') {
      const a = clamp(this.life / 0.4, 0, 1);
      ctx.save();
      ctx.globalAlpha = a * 0.85;
      ctx.fillStyle = '#ff7733';
      ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffd60a';
      ctx.beginPath(); ctx.arc(this.x, this.y, this.r * 0.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(this.x, this.y, this.r * 0.22, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    } else if (this.type === 'shuriken') {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.spin);
      ctx.fillStyle = PAL.steel;
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      for (let i = 0; i < 4; i++) {
        ctx.rotate(Math.PI / 2);
        ctx.beginPath();
        ctx.moveTo(0, -2);
        ctx.lineTo(15, -5);
        ctx.lineTo(8, 0);
        ctx.lineTo(15, 5);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      // Hub.
      ctx.fillStyle = INK;
      ctx.beginPath(); ctx.arc(0, 0, 2.4, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    } else if (this.type === 'bomb') {
      // Round bomb with a fuse spark — matches the bomb pickup glyph.
      ctx.fillStyle = '#2b2d42';
      ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath(); ctx.arc(this.x - this.r * 0.35, this.y - this.r * 0.35, this.r * 0.3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = PAL.ember;
      ctx.beginPath(); ctx.arc(this.x + this.r * 0.55, this.y - this.r * 0.85, 2.6, 0, Math.PI * 2); ctx.fill();
    } else if (this.type === 'grapple') {
      // Anchored grapples fade toward the end of their lifetime so the player
      // knows the trap is about to disappear.
      const fade = this.anchored ? clamp(this.anchorLife / 2.5, 0.4, 1) : 1;
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.lineCap = 'round';
      // Ink-edged cable with a bright core (cyan when anchored, gold in flight).
      ctx.strokeStyle = INK;
      ctx.lineWidth = 4.5;
      ctx.beginPath(); ctx.moveTo(this.x, this.startY); ctx.lineTo(this.x, this.tipY); ctx.stroke();
      ctx.strokeStyle = this.anchored ? PAL.cyan : '#ffe28a';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(this.x, this.startY); ctx.lineTo(this.x, this.tipY); ctx.stroke();
      if (this.anchored) {
        ctx.fillStyle = PAL.cyan;
        ctx.strokeStyle = INK;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(this.x, this.tipY, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        const pulse = 0.5 + Math.abs(Math.sin(performance.now() / 220)) * 0.5;
        ctx.globalAlpha = fade * 0.45 * pulse;
        ctx.strokeStyle = PAL.cyan;
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(this.x, this.tipY, 10, 0, Math.PI * 2); ctx.stroke();
      } else {
        ctx.restore();
        drawSpearhead(ctx, this.x, this.tipY, PAL.cyan);
        return;
      }
      ctx.restore();
    } else if (this.type === 'diagonal') {
      // Short barbed bolt rendered along its travel direction.
      const ang = Math.atan2(this.vy, this.vx);
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(ang);
      ctx.lineCap = 'round';
      ctx.strokeStyle = INK;
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(-22, 0); ctx.lineTo(2, 0); ctx.stroke();
      ctx.strokeStyle = '#ffe28a';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-22, 0); ctx.lineTo(2, 0); ctx.stroke();
      // Barbed steel head pointing along +x.
      ctx.fillStyle = '#e9eef5';
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(10, 0);
      ctx.lineTo(1, -5);
      ctx.lineTo(-8, -7);
      ctx.lineTo(-3, -2);
      ctx.lineTo(-1, -2);
      ctx.lineTo(-1, 2);
      ctx.lineTo(-3, 2);
      ctx.lineTo(-8, 7);
      ctx.lineTo(1, 5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = PAL.yellow;
      ctx.beginPath();
      ctx.moveTo(9, 0); ctx.lineTo(2, -2.4); ctx.lineTo(2, 2.4);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }
}
