import { FloatingText, Particle, Shockwave } from '../entities/particle';
import { Pickup } from '../entities/pickup';
import { dragonDropPickup } from '../entities/creature';
import { collideCircleRect, rand, rectOverlap } from '../utils';
import { AudioSys } from './audio';
import type { Game } from '../game';

/**
 * Single per-frame collision pass for every entity pair the gameplay state
 * cares about. Mutates `game` directly (kills players, pops balls, fires
 * pickups, detonates bombs). Should be called from updatePlaying after all
 * entity updates and before the cleanup-filter pass.
 */
export function resolveCollisions(game: Game) {
  const players = game.getLivingPlayers();

  // ---- Player vs (ball / hazard / crab / boss) ----
  for (const player of players) {
    if (player.invuln > 0) continue;
    const hb = game.getPlayerHurtbox(player);
    for (const b of game.balls) {
      if (b.dead) continue;
      const c = collideCircleRect(b.x, b.y, b.r, hb.x, hb.y, hb.w, hb.h);
      if (c) { game.killPlayer(player, 'ball'); break; }
    }
    if (player.dead) continue;
    for (const h of game.hazards) {
      const active = h.active !== false;
      const hurts = h.type === 'electric_beam' || h.type === 'boss_beam' || h.type === 'electric_barrier'
        || h.type === 'flame_vent' || h.type === 'falling_rock' || h.type === 'lava';
      if (active && hurts && rectOverlap(hb, h)) { game.killPlayer(player, 'hazard'); break; }
    }
    if (player.dead) continue;
    for (const c of game.crabs) {
      if (rectOverlap(hb, c.getHitbox())) { game.killPlayer(player, 'crab'); break; }
    }
    if (!player.dead && game.boss && !game.boss.dead) {
      const dx = player.x - game.boss.x, dy = (player.y - 24) - game.boss.y;
      if (Math.sqrt(dx*dx + dy*dy) < game.boss.r + 16) game.killPlayer(player, 'boss');
    }
  }

  // ---- Crab vs ball (crabs pop balls and reverse on contact) ----
  for (const c of game.crabs) {
    const hb = c.getHitbox();
    for (const b of game.balls) {
      if (b.dead) continue;
      if (collideCircleRect(b.x, b.y, b.r, hb.x, hb.y, hb.w, hb.h)) {
        game._popBall(b, c);
        c.vx *= -1;
      }
    }
  }

  // ---- Creatures: dragon pops balls / birds stun the player on contact. ----
  for (const cr of game.creatures) {
    if (cr.dead) continue;
    const hb = cr.getHitbox();
    // Creature vs ball — dragons pop, hostile birds don't interact (would feel
    // unfair if they popped balls AND stunned us).
    if (!cr.hostile) {
      for (const b of game.balls) {
        if (b.dead) continue;
        if (collideCircleRect(b.x, b.y, b.r, hb.x, hb.y, hb.w, hb.h)) {
          game._popBall(b, cr);
        }
      }
    }
    // Creature vs player — hostile birds STUN weapons (3s lockout). Friendly
    // dragons are walkable (no effect on the player).
    if (cr.hostile) {
      for (const player of game.getLivingPlayers()) {
        if (player.invuln > 0 || player.weaponDisabled > 0) continue;
        const phb = player.getHitbox();
        if (rectOverlap(phb, hb)) {
          player.weaponDisabled = 3;
          AudioSys.warning();
          game.floatingTexts.push(new FloatingText(player.x, player.y - 50, 'WEAPONS JAMMED!', '#ff4d6d', 16));
          // Tiny puff of feathers/stars on impact
          for (let i = 0; i < 8; i++) {
            const a = Math.random() * Math.PI * 2, s = rand(60, 160);
            game.particles.push(new Particle(player.x, player.y - 24, Math.cos(a)*s, Math.sin(a)*s, 0.5, '#ffd60a', 4));
          }
        }
      }
    }
  }

  // ---- Projectile vs creature (shoot down birds / kick the dragon) ----
  for (const p of game.projectiles) {
    if (p.dead) continue;
    for (const cr of game.creatures) {
      if (cr.dead) continue;
      const hb = cr.getHitbox();
      let hit = false;
      if (p.type === 'harpoon' || p.type === 'laser' || p.type === 'grapple') {
        if (p.x >= hb.x && p.x <= hb.x + hb.w
            && (p.tipY ?? p.y) <= hb.y + hb.h && (p.tipY ?? p.y) >= hb.y) hit = true;
      } else if (p.type === 'bullet' || p.type === 'pellet') {
        if (p.x >= hb.x && p.x <= hb.x + hb.w && p.y <= hb.y + hb.h && p.y >= hb.y) hit = true;
      } else {
        // Circular weapons (flame/shuriken/bomb/diagonal)
        if (collideCircleRect(p.x, p.y, p.r || 8, hb.x, hb.y, hb.w, hb.h)) hit = true;
      }
      if (hit) {
        p.didHit = true;
        const drop = cr.hit();
        game.addScore(cr.score);
        game.floatingTexts.push(new FloatingText(cr.x, cr.y - 14, '+' + cr.score, '#ffd60a', 16));
        if (cr.dead) {
          // Pop visual
          game.shockwaves.push(new Shockwave(cr.x, cr.y, 80, cr.kind === 'dragon' ? '#06d6a0' : '#ff4d6d', 0.35));
          for (let i = 0; i < 14; i++) {
            const a = Math.random() * Math.PI * 2, s = rand(80, 220);
            game.particles.push(new Particle(cr.x, cr.y, Math.cos(a)*s, Math.sin(a)*s, 0.5,
              cr.kind === 'red_bird' ? '#ff4d6d' : cr.kind === 'dragon' ? '#06d6a0' : '#9aa3ad', 5));
          }
          if (drop === 'guaranteed') game.pickups.push(new Pickup(cr.x, cr.y, dragonDropPickup()));
          else if (drop === 'maybe') {
            // Kicked dragon: triggers a localized helpful explosion that pops
            // every nearby ball (Pang behaviour). No pickup drop.
            const blast = 120;
            for (const b of game.balls) {
              if (b.dead) continue;
              const dx = b.x - cr.x, dy = b.y - cr.y;
              if (dx*dx + dy*dy < blast*blast) game._popBall(b, cr);
            }
            game.shockwaves.push(new Shockwave(cr.x, cr.y, 160, '#06d6a0', 0.5));
          }
        }
        if (p.consumeOnHit()) { p.dead = true; break; }
      }
    }
  }

  // ---- Projectile vs (boss / destructible / ball) ----
  for (const p of game.projectiles) {
    if (p.dead) continue;

    if (game.boss && !game.boss.dead && game.boss.collides(p)) {
      p.didHit = true;
      if (p.type === 'bomb') {
        game.explodeProjectile(p, p.x, p.y);
      } else {
        game.boss.hit(game, p.type === 'laser' ? 3 : p.type === 'shuriken' ? 2 : 1);
        if (p.consumeOnHit()) p.dead = true;
        if (p.type === 'shuriken') p.dead = true;
      }
    }

    for (const d of game.destructibles) {
      if (d.dead) continue;
      let hit = false;
      if (p.type === 'harpoon' || p.type === 'laser') {
        if (p.x >= d.x && p.x <= d.x + d.w && p.tipY <= d.y + d.h && p.tipY >= d.y) hit = true;
      } else if (p.type === 'bullet' || p.type === 'pellet') {
        if (p.x >= d.x && p.x <= d.x + d.w && p.y <= d.y + d.h && p.y >= d.y) hit = true;
      } else if (p.type === 'flame') {
        if (p.x + p.r > d.x && p.x - p.r < d.x + d.w && p.y + p.r > d.y && p.y - p.r < d.y + d.h) hit = true;
      } else if (p.type === 'shuriken' || p.type === 'bomb') {
        if (collideCircleRect(p.x, p.y, p.r, d.x, d.y, d.w, d.h)) hit = true;
      }
      if (hit) {
        p.didHit = true;
        if (p.type === 'bomb') {
          game.explodeProjectile(p, p.x, p.y);
          break;
        }
        d.hp--;
        if (d.hp <= 0) {
          d.dead = true;
          AudioSys.pop();
          game.addScore(100);
          if (d.contains) game.pickups.push(new Pickup(d.x + d.w / 2, d.y + d.h / 2, d.contains));
          for (let i = 0; i < 10; i++) {
            const a = Math.random() * Math.PI * 2, s = rand(60, 180);
            game.particles.push(new Particle(d.x + d.w/2, d.y + d.h/2, Math.cos(a)*s, Math.sin(a)*s, 0.5, '#a8682c', 6, 200));
          }
        }
        if (p.consumeOnHit()) { p.dead = true; break; }
      }
    }

    if (!p.dead) {
      for (const b of game.balls) {
        if (b.dead) continue;
        if (p.hits(b)) {
          p.didHit = true;
          if (p.type === 'bomb') {
            game.explodeProjectile(p, b.x, b.y);
            break;
          }
          game._popBall(b, p);
          p.hitBalls.add(b);
          if (p.type === 'shuriken' && p.hitBalls.size >= 3) { p.dead = true; break; }
          if (p.consumeOnHit()) { p.dead = true; break; }
        }
      }
    }
  }

  // ---- Co-op revive (Pang Adventures): living player stands over downed teammate ----
  const all = [game.player, game.player2].filter(Boolean) as ReturnType<Game['getLivingPlayers']>;
  for (const a of all) {
    if (!a || a.dead) continue;
    for (const b of all) {
      if (!b || b === a || !b.dead || b.respawnTimer <= 0) continue;
      const dx = a.x - b.x, dy = a.y - b.y;
      if (dx * dx + dy * dy < 36 * 36) {
        game.respawnPlayer(b);
        b.invuln = 1.5;
        game.floatingTexts.push(new FloatingText(b.x, b.y - 44, 'REVIVED!', '#06d6a0', 22));
        AudioSys.pickup();
        for (let i = 0; i < 16; i++) {
          const an = Math.random() * Math.PI * 2, s = rand(80, 200);
          game.particles.push(new Particle(b.x, b.y - 24, Math.cos(an)*s, Math.sin(an)*s, 0.55, '#06d6a0', 5));
        }
      }
    }
  }

  // ---- Player vs pickup (uses full hitbox so grab range is unaffected by tiny-hurtbox modifier) ----
  for (const player of game.getLivingPlayers()) {
    const hb = player.getHitbox();
    for (const pk of game.pickups) {
      if (pk.dead) continue;
      if (pk.x > hb.x - 14 && pk.x < hb.x + hb.w + 14 && pk.y > hb.y - 14 && pk.y < hb.y + hb.h + 14) {
        pk.apply(player, game);
        pk.dead = true;
      }
    }
  }
}
