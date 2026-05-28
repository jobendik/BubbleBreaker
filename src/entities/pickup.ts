import { GROUND_Y, GRAVITY, type PickupType } from '../constants';
import { AudioSys } from '../systems/audio';
import { advanceMissions } from '../systems/retention';
import { roundRect } from '../rendering/canvas';
import { INK, isLight, shade } from '../rendering/theme';
import { clamp } from '../utils';
import { FloatingText, Shockwave } from './particle';
import { Ball } from './ball';
import type { Player } from './player';
import type { Game } from '../game';

// ============================ PICKUP ================================
// Each pickup is a cel-shaded capsule (shared ink outline + top gloss) with a
// distinct vector glyph drawn by drawPickupGlyph(). The glyphs replaced the
// old single-letter labels — those were cryptic and collided (X = diagonal AND
// clearsmoke, M = machinegun AND magnet, S = shield AND slowtime), which read
// as unfinished programmer-art. Colors are pulled toward the brand palette so
// the whole pickup set looks like one designed sheet.
export const PICKUP_INFO: Record<PickupType, { color: string }> = {
  shield:     { color: '#3a86ff' },
  harpoon:    { color: '#ffe9a8' },
  double:     { color: '#06d6a0' },
  triple:     { color: '#9be7ff' },
  powerwire:  { color: '#48bfe3' },
  diagonal:   { color: '#ffd60a' },
  machinegun: { color: '#fb5607' },
  laser:      { color: '#ff36c4' },
  flame:      { color: '#ff7733' },
  shotgun:    { color: '#ffbe0b' },
  shuriken:   { color: '#dfe6ee' },
  bomb:       { color: '#2b2d42' },
  score:      { color: '#ffd60a' },
  life:       { color: '#ff4d6d' },
  time:       { color: '#56cbf9' },
  slowtime:   { color: '#9e7bff' },
  freeze:     { color: '#b9eaff' },
  clearsmoke: { color: '#cfd6df' },
  magnet:     { color: '#f72585' },
  combo:      { color: '#ff9f1c' },
  dynamite:   { color: '#ef233c' },
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
    const color = PICKUP_INFO[this.type].color;
    const y = this.y + (Math.sin(this.bob) * 3);
    const w = 30, h = 26;
    const x = this.x - w / 2, top = y - h / 2;
    const r = 8;

    // Contact shadow when near the floor — grounds the capsule the same way
    // balls and the player are grounded, so nothing floats "stylelessly."
    const altitude = GROUND_Y - (y + h / 2);
    if (altitude < 100) {
      const sa = 0.26 * (1 - clamp(altitude, 0, 100) / 100) + 0.05;
      ctx.fillStyle = `rgba(0,0,0,${sa.toFixed(3)})`;
      ctx.beginPath();
      ctx.ellipse(this.x, GROUND_Y + 2, 13, 4, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Capsule — cel-shaded fill (lit top → base → shadowed base), a top gloss
    // strip, then the clean 2px ink outline shared by the whole roster.
    const grad = ctx.createLinearGradient(0, top, 0, top + h);
    grad.addColorStop(0, shade(color, 0.42));
    grad.addColorStop(0.5, color);
    grad.addColorStop(1, shade(color, -0.26));
    ctx.fillStyle = grad;
    roundRect(ctx, x, top, w, h, r, true, false);
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#fff';
    roundRect(ctx, x + 3, top + 2.5, w - 6, h * 0.32, r - 4, true, false);
    ctx.restore();
    ctx.lineWidth = 2;
    ctx.strokeStyle = INK;
    ctx.lineJoin = 'round';
    roundRect(ctx, x, top, w, h, r, false, true);

    // Glyph — contrast-correct: ink on bright capsules, white on dark/saturated
    // ones (mirrors the .ui-chip text-color flip in the CSS).
    drawPickupGlyph(ctx, this.type, this.x, y, isLight(color) ? INK : '#fff');

    // Expiry pulse — clean white outline flash in the final 3 seconds.
    if (this.life < 3 && Math.floor(this.life * 6) % 2 === 0) {
      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#fff';
      roundRect(ctx, x, top, w, h, r, false, true);
      ctx.restore();
    }
  }
}

/** Draw a distinct vector glyph for each pickup, centered at (cx, cy) in the
 *  given color. Each silhouette is unique so the player reads "what is it" at
 *  a glance — no two share an icon. */
function drawPickupGlyph(ctx: CanvasRenderingContext2D, type: PickupType, cx: number, cy: number, color: string) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.4;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  switch (type) {
    case 'shield': {
      ctx.beginPath();
      ctx.moveTo(cx, cy - 8);
      ctx.lineTo(cx + 7, cy - 4.5);
      ctx.lineTo(cx + 7, cy + 1.5);
      ctx.quadraticCurveTo(cx + 7, cy + 6.5, cx, cy + 9);
      ctx.quadraticCurveTo(cx - 7, cy + 6.5, cx - 7, cy + 1.5);
      ctx.lineTo(cx - 7, cy - 4.5);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'life': {
      ctx.beginPath();
      ctx.moveTo(cx, cy + 8);
      ctx.bezierCurveTo(cx - 12, cy - 1, cx - 6, cy - 9, cx, cy - 3.5);
      ctx.bezierCurveTo(cx + 6, cy - 9, cx + 12, cy - 1, cx, cy + 8);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'score': {
      // Faceted gem.
      ctx.beginPath();
      ctx.moveTo(cx, cy - 8);
      ctx.lineTo(cx + 8, cy - 1.5);
      ctx.lineTo(cx, cy + 9);
      ctx.lineTo(cx - 8, cy - 1.5);
      ctx.closePath();
      ctx.fill();
      ctx.save();
      ctx.globalAlpha = 0.45;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(cx - 8, cy - 1.5); ctx.lineTo(cx + 8, cy - 1.5);
      ctx.moveTo(cx, cy - 8); ctx.lineTo(cx, cy + 9);
      ctx.stroke();
      ctx.restore();
      break;
    }
    case 'time': {
      ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.arc(cx, cy + 0.5, 7, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx, cy + 0.5); ctx.lineTo(cx, cy - 4.5);
      ctx.moveTo(cx, cy + 0.5); ctx.lineTo(cx + 4, cy + 2);
      ctx.stroke();
      break;
    }
    case 'slowtime': {
      // Hourglass.
      ctx.beginPath();
      ctx.moveTo(cx - 6, cy - 8); ctx.lineTo(cx + 6, cy - 8); ctx.lineTo(cx, cy); ctx.closePath();
      ctx.moveTo(cx - 6, cy + 8); ctx.lineTo(cx + 6, cy + 8); ctx.lineTo(cx, cy); ctx.closePath();
      ctx.fill();
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(cx - 7, cy - 8); ctx.lineTo(cx + 7, cy - 8);
      ctx.moveTo(cx - 7, cy + 8); ctx.lineTo(cx + 7, cy + 8);
      ctx.stroke();
      break;
    }
    case 'freeze': {
      // Snowflake — three crossing arms with end barbs.
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI;
        const dx = Math.cos(a) * 8.5, dy = Math.sin(a) * 8.5;
        ctx.beginPath();
        ctx.moveTo(cx - dx, cy - dy); ctx.lineTo(cx + dx, cy + dy); ctx.stroke();
        for (const s of [-1, 1]) {
          const ex = cx + dx * s, ey = cy + dy * s;
          const bx = -dx / 8.5, by = -dy / 8.5;
          ctx.beginPath();
          ctx.moveTo(ex, ey);
          ctx.lineTo(ex + bx * 3 - by * 3, ey + by * 3 + bx * 3);
          ctx.moveTo(ex, ey);
          ctx.lineTo(ex + bx * 3 + by * 3, ey + by * 3 - bx * 3);
          ctx.stroke();
        }
      }
      break;
    }
    case 'clearsmoke': {
      // Cloud puff + sweep lines (clearing the smoke).
      ctx.beginPath();
      ctx.arc(cx - 4, cy + 1, 4, 0, Math.PI * 2);
      ctx.arc(cx + 1, cy - 2.5, 5, 0, Math.PI * 2);
      ctx.arc(cx + 5, cy + 1, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx + 7, cy - 3); ctx.lineTo(cx + 11, cy - 3);
      ctx.moveTo(cx + 8, cy + 3); ctx.lineTo(cx + 11, cy + 3);
      ctx.stroke();
      break;
    }
    case 'magnet': {
      ctx.lineWidth = 3.4;
      ctx.beginPath(); ctx.arc(cx, cy - 1, 6, Math.PI, Math.PI * 2); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - 6, cy - 1); ctx.lineTo(cx - 6, cy + 7);
      ctx.moveTo(cx + 6, cy - 1); ctx.lineTo(cx + 6, cy + 7);
      ctx.stroke();
      // Pole tips.
      ctx.lineWidth = 1;
      ctx.fillRect(cx - 8, cy + 6, 4, 2.5);
      ctx.fillRect(cx + 4, cy + 6, 4, 2.5);
      break;
    }
    case 'combo': {
      // Rising double chevron.
      ctx.lineWidth = 2.6;
      for (let i = 0; i < 2; i++) {
        const yy = cy + 4 - i * 6;
        ctx.beginPath();
        ctx.moveTo(cx - 6, yy);
        ctx.lineTo(cx, yy - 5);
        ctx.lineTo(cx + 6, yy);
        ctx.stroke();
      }
      break;
    }
    case 'dynamite': {
      ctx.save();
      ctx.translate(cx - 1, cy + 1);
      ctx.rotate(-0.16);
      roundRect(ctx, -3.5, -7, 7, 14, 2.5, true, false);
      ctx.restore();
      // Lit fuse + spark.
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(cx + 1.5, cy - 7);
      ctx.quadraticCurveTo(cx + 7, cy - 11, cx + 8, cy - 6);
      ctx.stroke();
      ctx.beginPath(); ctx.arc(cx + 8, cy - 6, 1.8, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'harpoon': {
      ctx.lineWidth = 2.6;
      ctx.beginPath(); ctx.moveTo(cx, cy + 8); ctx.lineTo(cx, cy - 3); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx, cy - 9); ctx.lineTo(cx + 5, cy - 2); ctx.lineTo(cx - 5, cy - 2);
      ctx.closePath(); ctx.fill();
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(cx - 4, cy + 1.5); ctx.lineTo(cx, cy - 1.5); ctx.lineTo(cx + 4, cy + 1.5);
      ctx.stroke();
      break;
    }
    case 'double':
    case 'triple': {
      const spread = type === 'double' ? [-5, 5] : [-8, 0, 8];
      ctx.lineWidth = 2.1;
      for (const ox of spread) {
        ctx.beginPath(); ctx.moveTo(cx + ox, cy + 8); ctx.lineTo(cx + ox, cy - 3); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx + ox, cy - 8);
        ctx.lineTo(cx + ox + 3.5, cy - 3);
        ctx.lineTo(cx + ox - 3.5, cy - 3);
        ctx.closePath(); ctx.fill();
      }
      break;
    }
    case 'powerwire': {
      ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.moveTo(cx - 4, cy - 9); ctx.lineTo(cx + 4, cy - 9); ctx.stroke();
      ctx.lineWidth = 2.6;
      ctx.beginPath(); ctx.moveTo(cx, cy - 9); ctx.lineTo(cx, cy + 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx - 3, cy + 2, 3.4, -0.25, Math.PI + 0.5); ctx.stroke();
      break;
    }
    case 'diagonal': {
      ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.moveTo(cx - 7, cy + 7); ctx.lineTo(cx + 5, cy - 5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx + 7, cy + 7); ctx.lineTo(cx - 5, cy - 5); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx + 8, cy - 8); ctx.lineTo(cx + 8, cy - 3); ctx.lineTo(cx + 3, cy - 8); ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx - 8, cy - 8); ctx.lineTo(cx - 8, cy - 3); ctx.lineTo(cx - 3, cy - 8); ctx.closePath(); ctx.fill();
      break;
    }
    case 'machinegun': {
      for (let i = -1; i <= 1; i++) {
        const bx = cx + i * 5.2;
        ctx.beginPath();
        ctx.moveTo(bx - 2, cy + 7);
        ctx.lineTo(bx - 2, cy - 3);
        ctx.quadraticCurveTo(bx, cy - 8, bx + 2, cy - 3);
        ctx.lineTo(bx + 2, cy + 7);
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
    case 'laser': {
      // Vertical energy beam + horizontal flare.
      ctx.beginPath();
      ctx.moveTo(cx, cy - 9);
      ctx.lineTo(cx + 3, cy);
      ctx.lineTo(cx, cy + 9);
      ctx.lineTo(cx - 3, cy);
      ctx.closePath();
      ctx.fill();
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(cx - 7, cy); ctx.lineTo(cx + 7, cy); ctx.stroke();
      break;
    }
    case 'flame': {
      ctx.beginPath();
      ctx.moveTo(cx, cy + 8);
      ctx.quadraticCurveTo(cx - 7, cy + 3, cx - 3, cy - 3);
      ctx.quadraticCurveTo(cx - 1, cy - 8, cx + 2, cy - 9);
      ctx.quadraticCurveTo(cx + 1, cy - 4, cx + 4, cy - 4);
      ctx.quadraticCurveTo(cx + 8, cy + 2, cx, cy + 8);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'shotgun': {
      ctx.lineWidth = 2.2;
      const base = cy + 8;
      for (const ang of [-0.55, 0, 0.55]) {
        const ex = cx + Math.sin(ang) * 11;
        const ey = base - 15;
        ctx.beginPath(); ctx.moveTo(cx, base); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.beginPath(); ctx.arc(ex, ey, 1.9, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    case 'shuriken': {
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
        const rr = i % 2 === 0 ? 9 : 3.4;
        const px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = INK;
      ctx.beginPath(); ctx.arc(cx, cy, 1.7, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      break;
    }
    case 'bomb': {
      ctx.beginPath(); ctx.arc(cx, cy + 2, 6.4, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(cx + 2.5, cy - 3.5);
      ctx.quadraticCurveTo(cx + 7, cy - 9, cx + 4, cy - 10.5);
      ctx.stroke();
      ctx.beginPath(); ctx.arc(cx + 4, cy - 10.5, 1.9, 0, Math.PI * 2); ctx.fill();
      break;
    }
    default: {
      ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();
}
