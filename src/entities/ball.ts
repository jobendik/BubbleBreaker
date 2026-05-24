import { BALL_BOUNCE, BALL_COLORS, BALL_HSPEED, BALL_RADIUS, CEILING_Y, GROUND_Y, GRAVITY, WALL_L, WALL_R, type BallType, type PickupType } from '../constants';
import { AudioSys } from '../systems/audio';
import { clamp, collideCircleRect, rand, randi } from '../utils';
import { Hazard } from './hazard';
import { Particle, SmokeCloud } from './particle';
import { Pickup } from './pickup';
import type { Game } from '../game';

// ============================ BALL ==================================
export class Ball {
  x: number;
  y: number;
  size: number;
  r: number;
  type: BallType;
  vx: number;
  vy: number;
  dead: boolean;
  spin: number;
  armorHits: number;
  fuse: number;
  electricCharge: number;
  smokeTimer: number;
  squashTime: number;            // remaining seconds of squash-and-stretch after floor bounce
  /** Total floor bounces since spawn. AIR POP trick checks this — a ball
   *  popped without ever touching the floor is a satisfying skill shot. */
  floorBounces: number;
  /** Seconds since spawn. Used by AIR POP minimum-airtime rule so freshly
   *  spawned balls (which haven't had a chance to touch the floor yet) don't
   *  trivially qualify. */
  age: number;
  /** Time of the most recent wall bounce, in seconds since spawn. BANK SHOT
   *  trick checks `age - lastWallTime < ~0.35`. Negative initial value means
   *  "never bounced yet." */
  lastWallTime: number;
  constructor(x, y, size, type: BallType = 'normal', vx = 0, vy = 0) {
    this.x = x; this.y = y;
    this.size = size;
    this.r = BALL_RADIUS[size];
    this.type = type;
    this.vx = vx || (Math.random() < 0.5 ? -1 : 1) * BALL_HSPEED[size];
    this.vy = vy;
    this.dead = false;
    this.spin = 0;
    // Type-specific state
    this.armorHits = (type === 'armored') ? 1 : 0;  // remaining armor
    this.fuse = 0;                                   // explosive fuse
    this.electricCharge = rand(1.5, 3);              // electric ball discharge timer
    this.smokeTimer = 0;                             // smoke ball periodic puffs
    this.squashTime = 0;
    this.floorBounces = 0;
    this.age = 0;
    this.lastWallTime = -10;
  }

  /** Mark for split. Children inherit position, opposite horizontal velocities. */
  split(game) {
    this.dead = true;
    if (this.size === 0) return [];
    const children = [];
    for (let i = 0; i < 2; i++) {
      const dir = i === 0 ? -1 : 1;
      const child = new Ball(
        this.x, this.y - 8,
        this.size - 1, this.type,
        dir * BALL_HSPEED[this.size - 1],
        -BALL_BOUNCE[this.size - 1] * 0.65
      );
      children.push(child);
    }
    return children;
  }

  update(dt, game) {
    // Type-specific behaviour
    if (this.type === 'electric') {
      this.electricCharge -= dt;
      if (this.electricCharge <= 0) {
        // Discharge: spawn a brief downward electric beam hazard
        game.hazards.push(new Hazard('electric_beam', this.x - 6, this.y, 12, GROUND_Y - this.y, 0.6));
        AudioSys.warning();
        this.electricCharge = rand(2.5, 4);
      }
    }
    if (this.type === 'smoke') {
      this.smokeTimer -= dt;
      if (this.smokeTimer <= 0) {
        game.smokeClouds.push(new SmokeCloud(this.x + rand(-12, 12), this.y + rand(-8, 8), rand(26, 44), 2.8));
        this.smokeTimer = 0.45;
      }
    }
    if (this.type === 'explosive' && this.fuse > 0) {
      this.fuse -= dt;
      if (this.fuse <= 0) this.detonate(game);
    }

    // Physics
    this.vy += GRAVITY * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.spin += this.vx * dt * 0.02;
    this.age += dt;
    if (this.squashTime > 0) this.squashTime = Math.max(0, this.squashTime - dt);

    // Floor: arcade-consistent bounce (constant peak height)
    if (this.y + this.r >= GROUND_Y) {
      this.y = GROUND_Y - this.r;
      this.vy = -BALL_BOUNCE[this.size];
      this.squashTime = 0.18;
      this.floorBounces++;
      // Lava ball drips on bounce
      if (this.type === 'lava' && Math.random() < 0.6) {
        game.hazards.push(new Hazard('lava', this.x - 18, GROUND_Y - 4, 36, 8, 3.5));
      }
      // Sludge drops slime
      if (this.type === 'sludge' && Math.random() < 0.5) {
        game.hazards.push(new Hazard('slime', this.x - 22, GROUND_Y - 4, 44, 8, 4));
      }
    }

    // Walls
    if (this.x - this.r <= WALL_L) { this.x = WALL_L + this.r; this.vx = Math.abs(this.vx); this.lastWallTime = this.age; }
    else if (this.x + this.r >= WALL_R) { this.x = WALL_R - this.r; this.vx = -Math.abs(this.vx); this.lastWallTime = this.age; }

    // Ceiling
    if (this.y - this.r <= CEILING_Y) {
      this.y = CEILING_Y + this.r;
      if (this.vy < 0) this.vy = -this.vy * 0.8;
    }

    // Platforms - circle vs rect
    for (const p of game.platforms) {
      const c = collideCircleRect(this.x, this.y, this.r, p.x, p.y, p.w, p.h);
      if (c) {
        this.x += c.nx * c.depth;
        this.y += c.ny * c.depth;
        if (Math.abs(c.ny) > Math.abs(c.nx)) {
          // Vertical collision: arcade bounce
          if (c.ny < 0) { this.vy = -BALL_BOUNCE[this.size]; }
          else          { this.vy = Math.abs(this.vy) * 0.7; }
        } else {
          this.vx = c.nx * Math.abs(this.vx);
        }
      }
    }

    // Destructibles (also bouncy)
    for (const d of game.destructibles) {
      if (d.dead) continue;
      const c = collideCircleRect(this.x, this.y, this.r, d.x, d.y, d.w, d.h);
      if (c) {
        this.x += c.nx * c.depth;
        this.y += c.ny * c.depth;
        if (Math.abs(c.ny) > Math.abs(c.nx)) {
          if (c.ny < 0) this.vy = -BALL_BOUNCE[this.size];
          else this.vy = Math.abs(this.vy) * 0.7;
        } else this.vx = c.nx * Math.abs(this.vx);
      }
    }
  }

  detonate(game) {
    this.dead = true;
    AudioSys.explode();
    game.flash = 0.2;
    game.shake = 12;
    // Big particle ring
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = rand(120, 360);
      game.particles.push(new Particle(this.x, this.y, Math.cos(a) * s, Math.sin(a) * s, rand(0.4, 0.8), '#ff7733', 8, 200));
    }
    // Chain: split nearby balls
    const blastR = 130;
    for (const b of game.balls) {
      if (b === this || b.dead) continue;
      const dx = b.x - this.x, dy = b.y - this.y;
      if (dx*dx + dy*dy < blastR*blastR) {
        if (b.type === 'explosive') { b.fuse = 0.2; }
        else { game._popBall(b, this); }
      }
    }
  }

  /** Apply a hit. Returns array of new child balls created (possibly empty). */
  hit(game, source) {
    if (this.type === 'armored' && this.armorHits > 0) {
      this.armorHits--;
      AudioSys.bossHit();
      game.particles.push(new Particle(this.x, this.y, 0, -100, 0.4, '#fff', 6));
      return null; // not destroyed
    }
    if (this.type === 'explosive') {
      // Start fuse if not already
      if (this.fuse <= 0) {
        this.fuse = 0.6;
        return null;
      }
    }
    if (this.type === 'smoke') {
      for (let i = 0; i < 3; i++) game.smokeClouds.push(new SmokeCloud(this.x + rand(-18, 18), this.y + rand(-12, 12), rand(32, 52), 3.4));
    }
    if (this.type === 'electric' && source?.type === 'harpoon') {
      // Immediate discharge bolt at the hit point
      game.hazards.push(new Hazard('electric_beam', this.x - 6, this.y, 12, GROUND_Y - this.y, 0.4));
      AudioSys.warning();
    }
    if (this.type === 'bonus') {
      // Drop a random pickup
      game.pickups.push(new Pickup(this.x, this.y, randomPickupType()));
    }
    return this.split(game);
  }

  draw(ctx) {
    const c = BALL_COLORS[this.type] || BALL_COLORS.normal;
    // Shadow — alpha and width scale with how close the ball is to the floor,
    // giving the player a strong trajectory cue without obscuring the world.
    const altitude = clamp(GROUND_Y - (this.y + this.r), 0, 400);
    const shadowAlpha = 0.32 * (1 - altitude / 400) + 0.06;
    const shadowRX = this.r * (0.75 - altitude / 700);
    ctx.fillStyle = `rgba(0,0,0,${shadowAlpha.toFixed(3)})`;
    ctx.beginPath();
    ctx.ellipse(this.x, GROUND_Y + 2, Math.max(6, shadowRX), 4, 0, 0, Math.PI * 2);
    ctx.fill();
    // Squash-and-stretch — after a floor bounce we squash horizontally and
    // recover over ~180ms. Fully airborne balls render as perfect circles.
    const sqz = this.squashTime / 0.18;
    const rx = this.r * (1 + sqz * 0.28);
    const ry = this.r * (1 - sqz * 0.24);
    // Body
    const grad = ctx.createRadialGradient(this.x - rx * 0.4, this.y - ry * 0.4, rx * 0.1, this.x, this.y, rx);
    grad.addColorStop(0, '#fff');
    grad.addColorStop(0.25, c[0]);
    grad.addColorStop(1, c[1]);
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.ellipse(this.x, this.y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
    // Outline
    ctx.strokeStyle = '#1c0010';
    ctx.lineWidth = 2;
    ctx.stroke();
    // Highlight
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.ellipse(this.x - rx * 0.35, this.y - ry * 0.4, rx * 0.28, ry * 0.18, -0.4, 0, Math.PI * 2);
    ctx.fill();

    // Type icons
    if (this.type === 'electric') {
      // Pre-discharge warning: the closer to 0 the charge timer is, the brighter
      // the halo. Below 0.6s remaining the ring strobes white. Gives the player
      // a clear "about to fire downward" cue.
      const charge = this.electricCharge;
      if (charge < 1.2) {
        const urgency = clamp(1 - charge / 1.2, 0, 1);
        const strobe = 0.5 + Math.abs(Math.sin(performance.now() / (40 + (1 - urgency) * 120))) * 0.5;
        ctx.save();
        ctx.globalAlpha = 0.35 + urgency * 0.55 * strobe;
        ctx.strokeStyle = '#ffd60a';
        ctx.lineWidth = 3 + urgency * 4;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.r + 4 + urgency * 4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2 + Math.sin(performance.now() / 80) * 1;
      ctx.beginPath();
      ctx.moveTo(this.x - 4, this.y - 6);
      ctx.lineTo(this.x + 2, this.y - 1);
      ctx.lineTo(this.x - 2, this.y + 1);
      ctx.lineTo(this.x + 4, this.y + 6);
      ctx.stroke();
    } else if (this.type === 'explosive') {
      if (this.fuse > 0 && Math.floor(this.fuse * 10) % 2 === 0) {
        ctx.fillStyle = '#fff';
      } else {
        ctx.fillStyle = '#ffd60a';
      }
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r * 0.35, 0, Math.PI * 2);
      ctx.fill();
    } else if (this.type === 'armored' && this.armorHits > 0) {
      // Cross strap visual
      ctx.strokeStyle = '#222';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(this.x - this.r, this.y); ctx.lineTo(this.x + this.r, this.y);
      ctx.moveTo(this.x, this.y - this.r); ctx.lineTo(this.x, this.y + this.r);
      ctx.stroke();
    } else if (this.type === 'armored') {
      ctx.strokeStyle = '#20252a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(this.x - this.r * 0.35, this.y - this.r * 0.45);
      ctx.lineTo(this.x - this.r * 0.1, this.y - this.r * 0.15);
      ctx.lineTo(this.x - this.r * 0.28, this.y + this.r * 0.1);
      ctx.moveTo(this.x + this.r * 0.18, this.y - this.r * 0.35);
      ctx.lineTo(this.x + this.r * 0.02, this.y);
      ctx.lineTo(this.x + this.r * 0.28, this.y + this.r * 0.28);
      ctx.stroke();
    } else if (this.type === 'bonus') {
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${this.r}px sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('?', this.x, this.y);
      ctx.textBaseline = 'alphabetic';
    }
  }
}

export function randomPickupType() {
  const pool: PickupType[] = ['shield','double','machinegun','laser','flame','shotgun','shuriken','bomb','score','life','time','slowtime','freeze','clearsmoke','magnet','combo'];
  return pool[randi(0, pool.length - 1)];
}
