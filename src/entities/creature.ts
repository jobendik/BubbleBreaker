import { CEILING_Y, GROUND_Y, WALL_L, WALL_R } from '../constants';
import { randomPickupType } from './ball';
import { rand } from '../utils';

/**
 * Wandering, non-ball threats and helpers — homage to the Pang bestiary.
 *
 *  - 'bird'     : flying nuisance. Touching the player STUNS their weapons
 *                 (no kill, no damage). Player can shoot it to score points.
 *  - 'red_bird' : same hostile behaviour, but guaranteed pickup drop on kill.
 *  - 'ball_fish': airborne wavy-pattern variant of bird. Same stun rule.
 *  - 'dragon'   : ground-walking beneficial creature. Pops any ball that
 *                 touches it. Non-lethal to the player. Can be kicked
 *                 (shot) for a localized explosion + score.
 */
export type CreatureKind = 'bird' | 'red_bird' | 'ball_fish' | 'dragon';

export class Creature {
  kind: CreatureKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  dead: boolean;
  phase: number;
  hp: number;
  /** Hostile = stuns the player's weapons on contact (birds, ball-fish).
   *  Friendly = pops balls on contact, non-lethal to the player (dragon). */
  hostile: boolean;
  /** Score awarded when shot down. Red birds yield more + guaranteed pickup. */
  score: number;

  constructor(kind: CreatureKind, x: number, y: number, dir: number = 1) {
    this.kind = kind;
    this.x = x;
    this.y = y;
    this.phase = Math.random() * Math.PI * 2;
    this.dead = false;

    if (kind === 'dragon') {
      this.w = 38;
      this.h = 22;
      this.vx = dir * 60;
      this.vy = 0;
      this.hostile = false;
      this.hp = 2;
      this.score = 1200;
    } else if (kind === 'red_bird') {
      this.w = 26;
      this.h = 18;
      this.vx = dir * 180;
      this.vy = 0;
      this.hostile = true;
      this.hp = 1;
      this.score = 800;
    } else if (kind === 'ball_fish') {
      this.w = 30;
      this.h = 20;
      this.vx = dir * 140;
      this.vy = 0;
      this.hostile = true;
      this.hp = 1;
      this.score = 300;
    } else {
      // Standard bird
      this.w = 26;
      this.h = 16;
      this.vx = dir * 160;
      this.vy = 0;
      this.hostile = true;
      this.hp = 1;
      this.score = 250;
    }
  }

  getHitbox() {
    return { x: this.x - this.w / 2, y: this.y - this.h / 2, w: this.w, h: this.h };
  }

  update(dt: number) {
    this.phase += dt * 4;
    if (this.kind === 'dragon') {
      this.x += this.vx * dt;
      this.y = GROUND_Y;
      if (this.x < WALL_L + 30) { this.x = WALL_L + 30; this.vx = Math.abs(this.vx); }
      if (this.x > WALL_R - 30) { this.x = WALL_R - 30; this.vx = -Math.abs(this.vx); }
    } else {
      // Airborne wavy path
      const amp = this.kind === 'ball_fish' ? 28 : 14;
      const freq = this.kind === 'ball_fish' ? 1.8 : 3.2;
      this.x += this.vx * dt;
      this.y += Math.sin(this.phase * (freq * 0.5)) * amp * dt;
      // Wrap across walls so they fly through the play area
      if (this.x < WALL_L - 30) { this.x = WALL_R + 20; }
      if (this.x > WALL_R + 30) { this.x = WALL_L - 20; }
      // Clamp vertical band — keep them in the upper play area
      const top = CEILING_Y + 50;
      const bottom = GROUND_Y - 130;
      if (this.y < top) this.y = top;
      if (this.y > bottom) this.y = bottom;
    }
  }

  /** Apply a hit from a projectile. Returns dropped pickup type or null. */
  hit(): 'guaranteed' | 'maybe' | null {
    this.hp--;
    if (this.hp <= 0) {
      this.dead = true;
      if (this.kind === 'red_bird') return 'guaranteed';
      if (this.kind === 'dragon') return 'maybe';
      return null;
    }
    return null;
  }

  draw(ctx: CanvasRenderingContext2D) {
    const dir = Math.sign(this.vx) || 1;
    ctx.save();
    ctx.translate(this.x, this.y);
    if (this.kind === 'dragon') {
      // Friendly green dragon walking the floor.
      ctx.translate(0, -14);
      ctx.fillStyle = '#06d6a0';
      ctx.strokeStyle = '#06402b';
      ctx.lineWidth = 2;
      // Body
      ctx.beginPath();
      ctx.ellipse(0, 0, 18, 10, 0, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      // Head
      ctx.beginPath();
      ctx.ellipse(dir * 16, -4, 9, 7, 0, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      // Spines
      ctx.fillStyle = '#ffd60a';
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 6, -10);
        ctx.lineTo(i * 6 + 3, -16);
        ctx.lineTo(i * 6 + 6, -10);
        ctx.closePath();
        ctx.fill();
      }
      // Eye
      ctx.fillStyle = '#0a1832';
      ctx.beginPath();
      ctx.arc(dir * 19, -5, 1.5, 0, Math.PI * 2);
      ctx.fill();
      // Friendly smile
      ctx.strokeStyle = '#0a1832';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(dir * 17, -2, 3, 0, Math.PI, false);
      ctx.stroke();
      // Friendly aura — pulsing green ring telegraphs "I'm not dangerous."
      const pulse = 0.5 + Math.abs(Math.sin(performance.now() / 320)) * 0.5;
      ctx.globalAlpha = pulse * 0.3;
      ctx.strokeStyle = '#06d6a0';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 26, 0, Math.PI * 2);
      ctx.stroke();
    } else if (this.kind === 'ball_fish') {
      // Globe-fish: round body with tiny wings + tail.
      ctx.fillStyle = '#ffbe0b';
      ctx.strokeStyle = '#5b3500';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 11, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      // Side fin
      ctx.fillStyle = '#fb5607';
      ctx.beginPath();
      ctx.moveTo(-dir * 8, 0);
      ctx.lineTo(-dir * 18, -6);
      ctx.lineTo(-dir * 18, 6);
      ctx.closePath();
      ctx.fill();
      // Eye
      ctx.fillStyle = '#0a1832';
      ctx.beginPath();
      ctx.arc(dir * 4, -2, 1.8, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Bird / red bird
      const flap = Math.sin(this.phase * 2.5);
      ctx.fillStyle = this.kind === 'red_bird' ? '#ff4d6d' : '#9aa3ad';
      ctx.strokeStyle = '#0a1832';
      ctx.lineWidth = 2;
      // Body
      ctx.beginPath();
      ctx.ellipse(0, 0, 10, 6, 0, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      // Beak
      ctx.fillStyle = '#ffbe0b';
      ctx.beginPath();
      ctx.moveTo(dir * 8, -1);
      ctx.lineTo(dir * 14, 0);
      ctx.lineTo(dir * 8, 1);
      ctx.closePath();
      ctx.fill();
      // Wings — animated flap
      ctx.fillStyle = this.kind === 'red_bird' ? '#9d0a32' : '#3a4148';
      ctx.beginPath();
      ctx.moveTo(-2, 0);
      ctx.lineTo(2, -5 - flap * 5);
      ctx.lineTo(6, 0);
      ctx.lineTo(2, 4 + flap * 3);
      ctx.closePath();
      ctx.fill();
      // Eye
      ctx.fillStyle = '#fff';
      ctx.fillRect(dir * 4, -3, 2, 2);
    }
    ctx.restore();
  }
}

/** Random pickup type used by Dragon kills (mirrors bonus-ball drop pool). */
export function dragonDropPickup() { return randomPickupType(); }
