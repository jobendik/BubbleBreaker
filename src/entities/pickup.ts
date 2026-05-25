import { GROUND_Y, GRAVITY, type PickupType } from '../constants';
import { AudioSys } from '../systems/audio';
import { advanceMissions } from '../systems/retention';
import { roundRect } from '../rendering/canvas';
import { FloatingText, Shockwave } from './particle';
import { Ball } from './ball';
import type { Player } from './player';
import type { Game } from '../game';

// ============================ PICKUP ================================
export const PICKUP_INFO: Record<PickupType, { color: string; label: string }> = {
  shield:     { color: '#3a86ff', label: 'S' },
  harpoon:    { color: '#ffe9a8', label: 'H' },
  double:     { color: '#06d6a0', label: '2' },
  triple:     { color: '#9be7ff', label: '3' },
  powerwire:  { color: '#9be7ff', label: 'W' },
  diagonal:   { color: '#ffd60a', label: 'X' },
  machinegun: { color: '#fb5607', label: 'M' },
  laser:      { color: '#ff36c4', label: 'L' },
  flame:      { color: '#ff7733', label: 'F' },
  shotgun:    { color: '#ffbe0b', label: 'G' },
  shuriken:   { color: '#dfe6ee', label: 'N' },
  bomb:       { color: '#2b2d42', label: 'B' },
  score:      { color: '#ffd60a', label: '$' },
  life:       { color: '#ff4d6d', label: '1' },
  time:       { color: '#56cbf9', label: 'T' },
  slowtime:   { color: '#a06cd5', label: 'S' },
  freeze:     { color: '#9be7ff', label: 'Z' },
  clearsmoke: { color: '#cfd6df', label: 'X' },
  magnet:     { color: '#f72585', label: 'M' },
  combo:      { color: '#ff36c4', label: 'C' },
  dynamite:   { color: '#ff5400', label: 'D' },
};

export class Pickup {
  x: number;
  y: number;
  type: PickupType;
  vy: number;
  dead: boolean;
  life: number;
  bob: number;

  constructor(x, y, type: PickupType) {
    this.x = x; this.y = y; this.type = type;
    this.vy = -120;
    this.dead = false;
    this.life = 12;
    this.bob = 0;
  }

  update(dt, game: Game) {
    if (game.magnetTime > 0) {
      const players = game.getLivingPlayers();
      let target: Player | null = null;
      let best = Infinity;
      for (const p of players) {
        const dx = p.x - this.x, dy = (p.y - 24) - this.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < best) { best = d2; target = p; }
      }
      if (target && best < 260 * 260) {
        const d = Math.sqrt(best) || 1;
        this.x += ((target.x - this.x) / d) * 240 * dt;
        this.y += (((target.y - 24) - this.y) / d) * 240 * dt;
      }
    }

    this.vy += GRAVITY * 0.45 * dt;
    this.y += this.vy * dt;
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
    if (this.y > GROUND_Y - 12) {
      this.y = GROUND_Y - 12;
      this.vy = 0;
      this.bob += dt * 4;
    }
  }

  apply(player: Player, game: Game) {
    const t = this.type;
    AudioSys.pickup();
    advanceMissions('pickup', 1);
    game.floatingTexts.push(new FloatingText(this.x, this.y - 20, '+' + t.toUpperCase(), '#ffd60a', 16));
    if (t === 'shield') player.shield = true;
    else if (t === 'life') game.lives = Math.min(game.lives + 1, 9);
    else if (t === 'score') { game.addScore(2000); game.floatingTexts.push(new FloatingText(this.x, this.y - 40, '+2000', '#ffd60a')); }
    else if (t === 'time') { game.timer += 10; }
    else if (t === 'slowtime') { game.slowTime = 5; }
    else if (t === 'freeze') { game.freezeTime = 3.5; }
    else if (t === 'clearsmoke') { game.smokeClouds.length = 0; game.floatingTexts.push(new FloatingText(this.x, this.y - 42, 'CLEAR!', '#cfd6df', 18)); }
    else if (t === 'magnet') { game.magnetTime = 8; }
    else if (t === 'combo') { game.comboBoostTime = 8; game.comboDecay = Math.max(game.comboDecay, 4); }
    else if (t === 'dynamite') {
      // Classic Pang Dynamite: every active ball is instantly reduced to its
      // smallest size. High risk — a crowded screen becomes a swarm of fast
      // micro-balls and can wipe the player. Preserves ball type so elemental
      // hazards still apply (electric still discharges, sludge still drips).
      game.flash = 0.45;
      game.shake = 18;
      const survivors: Ball[] = [];
      for (const b of game.balls) {
        if (b.dead) continue;
        if (b.size === 0) {
          survivors.push(b);
        } else {
          survivors.push(new Ball(b.x, b.y - 10, 0, b.type, b.vx, -180));
        }
      }
      game.balls = survivors;
      game.shockwaves.push(new Shockwave(this.x, this.y, 240, '#ff5400', 0.5));
      game.floatingTexts.push(new FloatingText(this.x, this.y - 44, 'DYNAMITE!', '#ff5400', 22));
      AudioSys.explode();
    }
    else { player.setWeapon(t); }
  }

  draw(ctx: CanvasRenderingContext2D) {
    const info = PICKUP_INFO[this.type];
    const y = this.y + (Math.sin(this.bob) * 3);
    ctx.fillStyle = info.color;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    roundRect(ctx, this.x - 14, y - 12, 28, 24, 6, true, true);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(info.label, this.x, y);
    ctx.textBaseline = 'alphabetic';
    if (this.life < 3 && Math.floor(this.life * 6) % 2 === 0) {
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = '#fff';
      roundRect(ctx, this.x - 14, y - 12, 28, 24, 6, true, false);
      ctx.globalAlpha = 1;
    }
  }
}
