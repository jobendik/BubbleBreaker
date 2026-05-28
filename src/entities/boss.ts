import { CEILING_Y, GROUND_Y, W, WALL_L, WALL_R, type BallType } from '../constants';
import { AudioSys } from '../systems/audio';
import { INK } from '../rendering/theme';
import { rand, randi } from '../utils';
import { Ball } from './ball';
import { Hazard } from './hazard';
import { Particle } from './particle';
import type { Projectile } from './projectile';
import type { Game } from '../game';

// ============================ BOSS ==================================
/** A floating commander. Hovers near the ceiling, drifts laterally,
 *  cycles through three attack patterns, and exposes a weak point. */
export class Boss {
  x: number;
  y: number;
  vx: number;
  hp: number;
  maxHp: number;
  phase: number;
  attackTimer: number;
  attackIndex: number;
  r: number;
  flash: number;
  dead: boolean;
  beamCharge: number;
  beamY: number;
  constructor() {
    this.x = W / 2; this.y = CEILING_Y + 60;
    this.vx = 80;
    this.hp = 60; this.maxHp = 60;
    this.phase = 1;
    this.attackTimer = 2.5;
    this.attackIndex = 0;
    this.r = 60;
    this.flash = 0;
    this.dead = false;
    this.beamCharge = 0; // for beam attack
    this.beamY = 0;
  }
  update(dt, game) {
    if (this.dead) return;
    // Drift
    this.x += this.vx * dt;
    if (this.x < 120) { this.x = 120; this.vx = Math.abs(this.vx); }
    if (this.x > W - 120) { this.x = W - 120; this.vx = -Math.abs(this.vx); }
    this.y = CEILING_Y + 60 + Math.sin(performance.now() / 600) * 12;

    // Phase scaling
    const ratio = this.hp / this.maxHp;
    if (ratio < 0.66 && this.phase === 1) { this.phase = 2; this.attackTimer = 1; this.vx *= 1.2; }
    if (ratio < 0.33 && this.phase === 2) { this.phase = 3; this.attackTimer = 0.8; this.vx *= 1.3; }

    // Attack scheduler
    this.attackTimer -= dt;
    if (this.beamCharge > 0) {
      this.beamCharge -= dt;
      if (this.beamCharge <= 0) {
        // Fire beam: a horizontal sweep at this.beamY
        game.hazards.push(new Hazard('boss_beam', WALL_L, this.beamY - 8, WALL_R - WALL_L, 16, 0.8));
        AudioSys.explode();
        game.shake = 8;
      }
    }
    if (this.attackTimer <= 0) {
      this.doAttack(game);
      // Faster cadence in later phases
      const base = this.phase === 1 ? 3.5 : (this.phase === 2 ? 2.6 : 1.8);
      this.attackTimer = base + rand(-0.3, 0.3);
    }
    this.flash = Math.max(0, this.flash - dt);
  }

  doAttack(game) {
    const choices = this.phase === 1 ? [0, 1] : this.phase === 2 ? [0, 1, 2] : [0, 1, 2, 2];
    const a = choices[randi(0, choices.length - 1)];
    if (a === 0) {
      // Spawn 1-2 bouncing balls
      const count = this.phase >= 2 ? 2 : 1;
      for (let i = 0; i < count; i++) {
        const types: BallType[] = ['normal','normal','electric','explosive'];
        const type = types[randi(0, types.length - 1)];
        game.balls.push(new Ball(this.x + rand(-30, 30), this.y + 30, 2, type, rand(-160, 160), 0));
      }
      AudioSys.warning();
    } else if (a === 1) {
      // Telegraphed downward projectile from boss center
      const warnX = this.x;
      game.hazards.push(new Hazard('boss_warning', warnX - 8, this.y + 30, 16, GROUND_Y - this.y - 30, 0.5));
      setTimeout(() => {
        if (this.dead) return;
        game.hazards.push(new Hazard('boss_beam', warnX - 10, this.y + 30, 20, GROUND_Y - this.y - 30, 0.4));
        AudioSys.explode();
        game.shake = 6;
      }, 500);
    } else if (a === 2) {
      // Sweep beam: choose a Y between mid and floor, warn, then fire horizontal beam
      this.beamY = rand(GROUND_Y - 160, GROUND_Y - 40);
      game.hazards.push(new Hazard('boss_warning', WALL_L, this.beamY - 8, WALL_R - WALL_L, 16, 0.9));
      this.beamCharge = 0.9;
      AudioSys.warning();
    }
  }

  hit(game, damage = 1) {
    this.hp -= damage;
    this.flash = 0.2;
    AudioSys.bossHit();
    game.particles.push(new Particle(this.x, this.y, rand(-100,100), rand(-100,100), 0.5, '#fff', 6));
    if (this.hp <= 0) {
      this.dead = true;
      AudioSys.explode();
      for (let i = 0; i < 60; i++) {
        const a = Math.random() * Math.PI * 2;
        const s = rand(80, 400);
        game.particles.push(new Particle(this.x + rand(-30,30), this.y + rand(-20,20), Math.cos(a)*s, Math.sin(a)*s, rand(0.5,1.2), i%2?'#ff2b88':'#ffd60a', 10, 200));
      }
      game.shake = 30;
      game.flash = 0.4;
    }
  }

  /** Check if a projectile collides with the weak point (boss core). */
  collides(proj) {
    if (this.dead) return false;
    if (proj.type === 'harpoon' || proj.type === 'laser') {
      if (proj.x > this.x - this.r * 0.9 && proj.x < this.x + this.r * 0.9
          && proj.tipY < this.y + this.r * 0.7) return true;
    } else if (proj.type === 'bullet' || proj.type === 'pellet' || proj.type === 'shuriken' || proj.type === 'bomb') {
      const dx = proj.x - this.x, dy = proj.y - this.y;
      const rr = this.r + (proj.r || 0);
      if (dx*dx + dy*dy < rr * rr) return true;
    } else if (proj.type === 'flame') {
      const dx = proj.x - this.x, dy = proj.y - this.y;
      if (dx*dx + dy*dy < (this.r + proj.r) * (this.r + proj.r)) return true;
    }
    return false;
  }

  draw(ctx) {
    if (this.dead) return;
    const r = this.r;
    const now = performance.now();
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.lineJoin = 'round';
    if (this.flash > 0) ctx.filter = 'brightness(1.9)';

    // Phase aura — a pulsing menace ring that intensifies in later phases.
    if (this.phase >= 2) {
      const pa = (this.phase === 3 ? 0.3 : 0.18) * (0.6 + Math.abs(Math.sin(now / 300)) * 0.4);
      ctx.save();
      ctx.globalAlpha = pa;
      ctx.strokeStyle = '#ff2b88';
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(0, 0, r * 1.05, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }

    // Hover glow beneath the saucer.
    const glow = ctx.createRadialGradient(0, r * 0.5, 4, 0, r * 0.5, r * 1.1);
    glow.addColorStop(0, 'rgba(255,43,136,0.5)');
    glow.addColorStop(1, 'rgba(255,43,136,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.ellipse(0, r * 0.55, r * 0.9, r * 0.4, 0, 0, Math.PI * 2); ctx.fill();

    // Twin thruster flames.
    const flick = 6 + Math.sin(now / 60) * 4;
    for (const sx of [-r * 0.62, r * 0.62]) {
      ctx.fillStyle = '#ffd60a';
      ctx.beginPath();
      ctx.moveTo(sx - 6, r * 0.26); ctx.lineTo(sx + 6, r * 0.26); ctx.lineTo(sx, r * 0.26 + flick);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ff8ad0';
      ctx.beginPath();
      ctx.moveTo(sx - 3, r * 0.26); ctx.lineTo(sx + 3, r * 0.26); ctx.lineTo(sx, r * 0.26 + flick * 0.6);
      ctx.closePath(); ctx.fill();
    }

    // Side pods — menace fins flanking the hull.
    for (const sx of [-1, 1]) {
      ctx.fillStyle = '#4a2f7a';
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(sx * r * 0.82, 4, r * 0.15, r * 0.24, sx * 0.45, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    }

    // Lower hull — wide cel-shaded metallic disc with the shared ink outline.
    const hull = ctx.createLinearGradient(0, -r * 0.1, 0, r * 0.5);
    hull.addColorStop(0, '#8a5fc4');
    hull.addColorStop(0.5, '#5a3a8a');
    hull.addColorStop(1, '#2e1b52');
    ctx.fillStyle = hull;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(0, 8, r, r * 0.46, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

    // Rim lights chasing around the disc.
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const lx = Math.cos(a) * r * 0.82, ly = 8 + Math.sin(a) * r * 0.38;
      const on = Math.sin(now / 200 + i) > 0;
      ctx.fillStyle = on ? '#ffd60a' : 'rgba(255,43,136,0.65)';
      ctx.beginPath(); ctx.arc(lx, ly, 2.4, 0, Math.PI * 2); ctx.fill();
    }

    // Dome — glowing pink canopy, ink outline + glass highlight.
    const dome = ctx.createLinearGradient(0, -r * 0.5, 0, 2);
    dome.addColorStop(0, '#ff8ac4');
    dome.addColorStop(1, '#ff2b88');
    ctx.fillStyle = dome;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(0, -4, r * 0.58, r * 0.46, 0, Math.PI, 0); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.beginPath(); ctx.ellipse(-r * 0.22, -16, r * 0.16, r * 0.1, -0.3, 0, Math.PI * 2); ctx.fill();

    // Angry brows.
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-12, -15); ctx.lineTo(-3, -10);
    ctx.moveTo(12, -15); ctx.lineTo(3, -10);
    ctx.stroke();

    // Weak-point core eye — ink socket, glowing iris, vertical slit pupil.
    const pulse = 0.6 + Math.abs(Math.sin(now / 240)) * 0.4;
    ctx.fillStyle = INK;
    ctx.beginPath(); ctx.arc(0, -3, 11, 0, Math.PI * 2); ctx.fill();
    ctx.save();
    ctx.globalAlpha = 0.45 * pulse;
    ctx.fillStyle = '#ffd60a';
    ctx.beginPath(); ctx.arc(0, -3, 13, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    const iris = ctx.createRadialGradient(-1, -4, 1, 0, -3, 9);
    iris.addColorStop(0, '#fff');
    iris.addColorStop(0.35, '#ffd60a');
    iris.addColorStop(1, '#ff7b00');
    ctx.fillStyle = iris;
    ctx.beginPath(); ctx.arc(0, -3, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = INK;
    ctx.beginPath(); ctx.ellipse(0, -3, 2.3, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath(); ctx.arc(-2.6, -6, 1.6, 0, Math.PI * 2); ctx.fill();

    ctx.filter = 'none';
    ctx.restore();
  }
}
