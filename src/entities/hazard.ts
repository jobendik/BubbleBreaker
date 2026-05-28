import { GROUND_Y, GRAVITY } from '../constants';
import { clamp } from '../utils';
import { roundRect } from '../rendering/canvas';
import { INK } from '../rendering/theme';

// ============================ HAZARD ================================
export type HazardType = 'lava' | 'slime' | 'electric_beam' | 'boss_warning' | 'boss_beam' | 'electric_barrier' | 'flame_vent' | 'falling_rock';

export class Hazard {
  type: HazardType;
  x: number;
  y: number;
  w: number;
  h: number;
  life: number;
  maxLife: number;
  dead: boolean;
  active: boolean;
  phase: number;
  vy: number;
  constructor(type, x, y, w, h, life = 3) {
    this.type = type; this.x = x; this.y = y; this.w = w; this.h = h;
    this.life = life; this.maxLife = life; this.dead = false;
    this.active = true;
    this.phase = Math.random() * Math.PI * 2;
    this.vy = type === 'falling_rock' ? 30 : 0;
  }
  update(dt) {
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
    if (this.type === 'electric_barrier') {
      this.phase += dt * 2.8;
      this.active = Math.sin(this.phase) > -0.2;
    } else if (this.type === 'flame_vent') {
      this.phase += dt * 3.4;
      this.active = Math.sin(this.phase) > 0.15;
    } else if (this.type === 'falling_rock') {
      this.vy += GRAVITY * 0.55 * dt;
      this.y += this.vy * dt;
      if (this.y > GROUND_Y - this.h) {
        this.y = GROUND_Y - this.h;
        this.life = Math.min(this.life, 0.35);
      }
    }
  }
  draw(ctx) {
    if (this.type === 'lava') {
      ctx.fillStyle = '#ff5400';
      roundRect(ctx, this.x, this.y, this.w, this.h, 3, true, false);
      ctx.fillStyle = '#ffd60a';
      ctx.globalAlpha = 0.6 * (this.life / this.maxLife);
      ctx.fillRect(this.x + 4, this.y + 2, this.w - 8, 2);
      ctx.globalAlpha = 1;
    } else if (this.type === 'slime') {
      // Same green family as the sludge ball that drips it, so the cause/effect
      // reads as one material.
      ctx.fillStyle = '#6aa82e';
      roundRect(ctx, this.x, this.y, this.w, this.h, 4, true, false);
      ctx.fillStyle = '#9be15d';
      ctx.fillRect(this.x + 4, this.y + 2, this.w - 8, 2);
    } else if (this.type === 'electric_beam') {
      const a = clamp(this.life / this.maxLife, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = '#ffd60a';
      ctx.fillRect(this.x, this.y, this.w, this.h);
      ctx.fillStyle = '#fff';
      ctx.fillRect(this.x + this.w/2 - 1, this.y, 2, this.h);
      ctx.globalAlpha = 1;
    } else if (this.type === 'boss_warning') {
      const a = (Math.sin(performance.now() / 60) + 1) / 2;
      ctx.globalAlpha = a;
      ctx.fillStyle = '#ff2b88';
      ctx.fillRect(this.x, this.y, this.w, this.h);
      ctx.globalAlpha = 1;
    } else if (this.type === 'boss_beam') {
      ctx.fillStyle = '#ff2b88';
      ctx.fillRect(this.x, this.y, this.w, this.h);
      ctx.fillStyle = '#fff';
      ctx.fillRect(this.x + 2, this.y, this.w - 4, this.h);
    } else if (this.type === 'electric_barrier') {
      ctx.globalAlpha = this.active ? 0.9 : 0.22;
      ctx.fillStyle = this.active ? '#ffd60a' : '#795b13';
      ctx.fillRect(this.x, this.y, this.w, this.h);
      ctx.fillStyle = '#fff';
      ctx.fillRect(this.x + this.w / 2 - 1, this.y, 2, this.h);
      ctx.globalAlpha = 1;
    } else if (this.type === 'flame_vent') {
      ctx.fillStyle = '#343a40';
      roundRect(ctx, this.x, this.y + this.h - 8, this.w, 8, 3, true, false);
      if (this.active) {
        const flicker = 4 + Math.sin(performance.now() / 40) * 3;
        ctx.fillStyle = '#ff5400';
        ctx.beginPath();
        ctx.moveTo(this.x + 4, this.y + this.h - 8);
        ctx.lineTo(this.x + this.w / 2, this.y - flicker);
        ctx.lineTo(this.x + this.w - 4, this.y + this.h - 8);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#ffd60a';
        ctx.beginPath();
        ctx.moveTo(this.x + 12, this.y + this.h - 8);
        ctx.lineTo(this.x + this.w / 2, this.y + 14 - flicker);
        ctx.lineTo(this.x + this.w - 12, this.y + this.h - 8);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.fillStyle = 'rgba(255,84,0,0.35)';
        ctx.fillRect(this.x + 6, this.y + this.h - 14, this.w - 12, 3);
      }
    } else if (this.type === 'falling_rock') {
      // Landing-point telegraph: pulsing ring on the floor directly under the
      // rock so the player can dodge laterally. Hidden once the rock has landed
      // (small life remaining → impact frame is already happening).
      if (this.y + this.h < GROUND_Y - 4 && this.life > 0.4) {
        const cx = this.x + this.w / 2;
        const pulse = 0.5 + Math.abs(Math.sin(performance.now() / 110)) * 0.5;
        ctx.save();
        ctx.globalAlpha = 0.35 + pulse * 0.4;
        ctx.strokeStyle = '#ff4d6d';
        ctx.lineWidth = 2 + pulse * 2;
        ctx.beginPath();
        ctx.ellipse(cx, GROUND_Y + 1, this.w * 0.85, 6, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 0.2 + pulse * 0.3;
        ctx.fillStyle = '#ff4d6d';
        ctx.beginPath();
        ctx.ellipse(cx, GROUND_Y + 1, this.w * 0.5, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = '#5c4d46';
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(this.x + this.w * 0.2, this.y);
      ctx.lineTo(this.x + this.w * 0.85, this.y + this.h * 0.1);
      ctx.lineTo(this.x + this.w, this.y + this.h * 0.7);
      ctx.lineTo(this.x + this.w * 0.55, this.y + this.h);
      ctx.lineTo(this.x + this.w * 0.1, this.y + this.h * 0.82);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }
}
