import { GROUND_Y, WALL_L, WALL_R, type WeaponType } from '../constants';
import { AudioSys } from '../systems/audio';
import { keys } from '../systems/input';
import { equippedPalette } from '../systems/titles';
import { clamp } from '../utils';
import { roundRect } from '../rendering/canvas';
import { Projectile } from './projectile';
import type { Game } from '../game';

// ============================ PLAYER ================================
export class Player {
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  speed: number;
  facing: number;
  isP2: boolean;
  weapon: WeaponType;
  weaponAmmo: number;
  weaponTime: number;
  shotCooldown: number;
  flameActive: boolean;
  shield: boolean;
  invuln: number;
  dead: boolean;
  respawnTimer: number;
  bob: number;
  walkAnim: number;
  /** Seconds remaining where weapons are disabled (after touching a Bird /
   *  Ball-Fish). 0 means weapons are normal. */
  weaponDisabled: number;
  constructor(x, y, isP2 = false) {
    this.x = x; this.y = y;
    this.w = 30; this.h = 46;
    this.vx = 0;
    this.speed = 320;
    this.facing = 1;
    this.isP2 = isP2;

    // Weapon state
    this.weapon = 'harpoon';
    this.weaponAmmo = 0;          // for limited-ammo weapons
    this.weaponTime = 0;          // for timed weapons
    this.shotCooldown = 0;
    this.flameActive = false;     // for flamethrower visuals

    // Survival
    this.shield = false;
    this.invuln = 0;              // brief i-frames after respawn
    this.dead = false;
    this.respawnTimer = 0;
    this.weaponDisabled = 0;

    // Anim
    this.bob = 0;
    this.walkAnim = 0;
  }

  /** Returns the smaller-than-visual hitbox for forgiving collisions. */
  getHitbox() {
    return { x: this.x - 10, y: this.y - this.h + 6, w: 20, h: this.h - 8 };
  }

  /** Player muzzle position - top of the gun barrel */
  getMuzzle() {
    return { x: this.x + this.facing * 4, y: this.y - this.h + 8 };
  }

  update(dt, game) {
    if (this.dead) return;

    // Input mapping (P1 = WASD/arrows + Space, P2 = JKL + I/U)
    const left  = this.isP2 ? keys.KeyJ : (keys.KeyA || keys.ArrowLeft);
    const right = this.isP2 ? keys.KeyL : (keys.KeyD || keys.ArrowRight);
    const shoot = this.isP2 ? (keys.KeyI || keys.KeyU || keys.KeyK)
                            : (keys.Space || keys.KeyW || keys.ArrowUp);

    // Horizontal movement with friction
    let inSlime = false;
    for (const h of game.hazards) {
      if (h.type === 'slime' && this.x > h.x && this.x < h.x + h.w && Math.abs(this.y - h.y) < 24) inSlime = true;
    }
    const speedMul = inSlime ? 0.45 : 1;

    if (left && !right) { this.vx = -this.speed * speedMul; this.facing = -1; }
    else if (right && !left) { this.vx = this.speed * speedMul; this.facing = 1; }
    else this.vx = 0;

    this.x += this.vx * dt;
    this.x = clamp(this.x, WALL_L + this.w/2, WALL_R - this.w/2);

    // Walk + idle animation. Walking advances faster and bigger; standing
    // still adds a tiny breathing motion so the character feels alive.
    if (this.vx !== 0) {
      this.walkAnim += dt * 12;
      this.bob = Math.sin(this.walkAnim) * 2;
    } else {
      this.walkAnim += dt * 2.2;
      this.bob = Math.sin(this.walkAnim) * 0.6;
    }

    // Lava damage
    for (const h of game.hazards) {
      if (h.type === 'lava' && !h.dead && this.x > h.x && this.x < h.x + h.w && Math.abs(this.y - h.y) < 28) {
        if (this.invuln <= 0) game.killPlayer(this, 'hazard');
      }
    }

    // Weapon timers
    this.shotCooldown -= dt;
    this.invuln -= dt;
    if (this.weaponDisabled > 0) this.weaponDisabled = Math.max(0, this.weaponDisabled - dt);
    if (this.weaponTime > 0) {
      this.weaponTime -= dt;
      if (this.weaponTime <= 0 && this.weapon !== 'harpoon') {
        this.setWeapon('harpoon');
      }
    }

    // Shooting (blocked entirely while a Bird/Ball-Fish has disabled weapons)
    this.flameActive = false;
    if (shoot && this.weaponDisabled <= 0) this.tryShoot(game);
  }

  tryShoot(game) {
    const m = this.getMuzzle();
    if (this.weapon === 'harpoon') {
      // Single-active-shot rule: only fire if no live harpoon owned by this player
      const live = game.projectiles.some(p => p.owner === this && p.type === 'harpoon' && !p.dead);
      if (!live && this.shotCooldown <= 0) {
        game.projectiles.push(new Projectile(m.x, m.y, 'harpoon', this));
        this.shotCooldown = 0.08;
        game.shotsFired++;
        AudioSys.shoot();
      }
    } else if (this.weapon === 'double') {
      const live = game.projectiles.filter(p => p.owner === this && p.type === 'harpoon' && !p.dead).length;
      if (live < 2 && this.shotCooldown <= 0) {
        game.projectiles.push(new Projectile(m.x, m.y, 'harpoon', this));
        this.shotCooldown = 0.05;
        game.shotsFired++;
        AudioSys.shoot();
      }
    } else if (this.weapon === 'triple') {
      // Pang! 3 Triple Harpoon — three concurrent harpoons in flight.
      const live = game.projectiles.filter(p => p.owner === this && p.type === 'harpoon' && !p.dead).length;
      if (live < 3 && this.shotCooldown <= 0) {
        game.projectiles.push(new Projectile(m.x, m.y, 'harpoon', this));
        this.shotCooldown = 0.04;
        game.shotsFired++;
        AudioSys.shoot();
      }
    } else if (this.weapon === 'powerwire') {
      // Power Wire — fires a grapple that anchors to the ceiling. Two grapples
      // may coexist on screen at once (the Double Power Wire upgrade is the
      // default tuning for this weapon, matching its Pang utility role).
      const live = game.projectiles.filter(p => p.owner === this && p.type === 'grapple' && !p.dead).length;
      if (live < 2 && this.shotCooldown <= 0) {
        game.projectiles.push(new Projectile(m.x, m.y, 'grapple', this));
        this.shotCooldown = 0.18;
        game.shotsFired++;
        AudioSys.shoot();
        this.weaponAmmo--;
        if (this.weaponAmmo <= 0) this.setWeapon('harpoon');
      }
    } else if (this.weapon === 'diagonal') {
      // Sheila the Thief: paired 45-degree harpoons. Each press fires both.
      if (this.shotCooldown <= 0 && this.weaponAmmo > 0) {
        const k = Math.SQRT1_2; // ≈ 0.707
        game.projectiles.push(new Projectile(m.x, m.y, 'diagonal', this, -k, -k));
        game.projectiles.push(new Projectile(m.x, m.y, 'diagonal', this,  k, -k));
        this.shotCooldown = 0.22;
        this.weaponAmmo--;
        game.shotsFired += 2;
        AudioSys.shoot();
        if (this.weaponAmmo <= 0) this.setWeapon('harpoon');
      }
    } else if (this.weapon === 'machinegun') {
      if (this.shotCooldown <= 0 && this.weaponAmmo > 0) {
        game.projectiles.push(new Projectile(m.x, m.y, 'bullet', this));
        this.shotCooldown = 0.07;
        this.weaponAmmo--;
        game.shotsFired++;
        AudioSys.shoot();
        if (this.weaponAmmo <= 0) this.setWeapon('harpoon');
      }
    } else if (this.weapon === 'laser') {
      if (this.shotCooldown <= 0 && this.weaponAmmo > 0) {
        game.projectiles.push(new Projectile(m.x, m.y, 'laser', this));
        this.shotCooldown = 0.6;
        this.weaponAmmo--;
        game.shotsFired++;
        AudioSys.shoot();
        game.flash = 0.15;
        if (this.weaponAmmo <= 0) this.setWeapon('harpoon');
      }
    } else if (this.weapon === 'flame') {
      this.flameActive = true;
      if (this.shotCooldown <= 0 && this.weaponAmmo > 0) {
        game.projectiles.push(new Projectile(m.x, m.y, 'flame', this));
        this.shotCooldown = 0.03;
        this.weaponAmmo--;
        if (this.weaponAmmo <= 0) this.setWeapon('harpoon');
      }
    } else if (this.weapon === 'shotgun') {
      if (this.shotCooldown <= 0 && this.weaponAmmo > 0) {
        for (let i = -2; i <= 2; i++) {
          const p = new Projectile(m.x, m.y, 'pellet', this);
          p.vx = i * 130;
          p.vy = -900 + Math.abs(i) * 40;
          game.projectiles.push(p);
        }
        this.shotCooldown = 0.4;
        this.weaponAmmo--;
        game.shotsFired++;
        AudioSys.shoot();
        if (this.weaponAmmo <= 0) this.setWeapon('harpoon');
      }
    } else if (this.weapon === 'shuriken') {
      if (this.shotCooldown <= 0 && this.weaponAmmo > 0) {
        game.projectiles.push(new Projectile(m.x, m.y, 'shuriken', this));
        this.shotCooldown = 0.28;
        this.weaponAmmo--;
        game.shotsFired++;
        AudioSys.shoot();
        if (this.weaponAmmo <= 0) this.setWeapon('harpoon');
      }
    } else if (this.weapon === 'bomb') {
      if (this.shotCooldown <= 0 && this.weaponAmmo > 0) {
        game.projectiles.push(new Projectile(m.x, m.y, 'bomb', this));
        this.shotCooldown = 0.55;
        this.weaponAmmo--;
        game.shotsFired++;
        AudioSys.shoot();
        if (this.weaponAmmo <= 0) this.setWeapon('harpoon');
      }
    }
  }

  setWeapon(name) {
    this.weapon = name;
    switch (name) {
      case 'harpoon':    this.weaponTime = 0; this.weaponAmmo = 0; break;
      case 'double':     this.weaponTime = 12; break;
      case 'triple':     this.weaponTime = 10; break;             // top-tier — short uptime
      case 'powerwire':  this.weaponAmmo = 6;  break;             // fixed grapples per pickup
      case 'diagonal':   this.weaponAmmo = 12; break;             // 12 paired bolts
      case 'machinegun': this.weaponAmmo = 60; break;
      case 'laser':      this.weaponAmmo = 8;  break;
      case 'flame':      this.weaponAmmo = 90; break;
      case 'shotgun':    this.weaponAmmo = 6;  break;
      case 'shuriken':   this.weaponAmmo = 16; break;
      case 'bomb':       this.weaponAmmo = 5;  break;
    }
  }

  draw(ctx) {
    if (this.dead) return;

    const x = this.x, y = this.y + this.bob;
    // Invuln flicker
    if (this.invuln > 0 && Math.floor(this.invuln * 20) % 2 === 0) { return; }

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(x, GROUND_Y + 2, 16, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Body palette — P1 hero blue / P2 teal. Highlight/dark variants drive
    // the torso gradient and the boot/strap detail.
    const palette = this.isP2 ? null : equippedPalette().colors;
    const bodyColor = this.isP2 ? '#34a0a4' : palette!.body;
    const bodyDark  = this.isP2 ? '#1d646a' : palette!.bodyDark;
    const bodyHi    = this.isP2 ? '#6bd6db' : palette!.bodyHi;
    const bootColor = this.isP2 ? '#0e3a3f' : palette!.boot;
    ctx.strokeStyle = '#0a1832';
    ctx.lineWidth = 2;
    // Legs — walk-cycle sway offsets each leg vertically so the character
    // visibly strides instead of just bobbing. Standing still produces near-
    // zero swing (the walkAnim still ticks but the amplitude collapses).
    const stride = (this.vx !== 0 ? 2.5 : 0);
    const legL_dy = Math.sin(this.walkAnim) * stride;
    const legR_dy = -legL_dy;
    // Left leg
    ctx.fillStyle = bodyDark;
    roundRect(ctx, x - 10, y - 14 + legL_dy, 7, 14 - legL_dy, 2, true, true);
    // Right leg
    roundRect(ctx, x + 3,  y - 14 + legR_dy, 7, 14 - legR_dy, 2, true, true);
    // Boots — darker chunky tip at the bottom of each leg for definition.
    ctx.fillStyle = bootColor;
    roundRect(ctx, x - 11, y - 4 + legL_dy, 9, 4, 1.5, true, false);
    roundRect(ctx, x + 2,  y - 4 + legR_dy, 9, 4, 1.5, true, false);
    // Torso — vertical gradient with a slight highlight at the top. The
    // narrow-shoulder silhouette pushes the head/face to "read first."
    const torsoGrad = ctx.createLinearGradient(0, y - 36, 0, y - 12);
    torsoGrad.addColorStop(0,    bodyHi);
    torsoGrad.addColorStop(0.5,  bodyColor);
    torsoGrad.addColorStop(1,    bodyDark);
    ctx.fillStyle = torsoGrad;
    roundRect(ctx, x - 13, y - 36, 26, 24, 6, true, true);
    // Chest strap — diagonal accent across the torso for character read.
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = bodyDark;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(x - 12, y - 26);
    ctx.lineTo(x + 12, y - 18);
    ctx.stroke();
    ctx.restore();
    // Head — slightly larger, with a soft gradient for volume.
    const headGrad = ctx.createRadialGradient(x - 3, y - 44, 1, x, y - 42, 10);
    headGrad.addColorStop(0, '#ffe5c3');
    headGrad.addColorStop(1, '#d4a070');
    ctx.fillStyle = headGrad;
    ctx.beginPath();
    ctx.arc(x, y - 42, 10, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();

    // Hat band shadow on the forehead — a darker arc where the hat sits, which
    // sells "head wearing something" instead of "ball with eye."
    ctx.fillStyle = 'rgba(80,40,10,0.32)';
    ctx.beginPath();
    ctx.ellipse(x, y - 47, 10, 4, 0, 0, Math.PI, true);
    ctx.fill();

    // Explorer hat — wide brim + rounded crown. Strong distinctive silhouette
    // that reads at canvas scale and signals "adventurer." Brim asymmetry
    // (slightly wider on the facing side) gives the hat directional read.
    const hatColor   = this.isP2 ? '#3a6a72' : palette!.hat;
    const hatColorHi = this.isP2 ? '#5a8a92' : palette!.hatHi;
    const hatColorDk = this.isP2 ? '#1f3a3f' : palette!.hatDark;
    // Brim — wide flat ellipse.
    ctx.fillStyle = hatColor;
    ctx.strokeStyle = '#0a1832';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(x + this.facing * 1, y - 49, 15, 3.5, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    // Crown — rounded dome on top of the brim.
    ctx.fillStyle = hatColor;
    ctx.beginPath();
    ctx.moveTo(x - 7, y - 49);
    ctx.quadraticCurveTo(x - 7, y - 58, x, y - 58);
    ctx.quadraticCurveTo(x + 7, y - 58, x + 7, y - 49);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Crown highlight — narrow brighter band along the top-left, sells volume.
    ctx.fillStyle = hatColorHi;
    ctx.beginPath();
    ctx.moveTo(x - 6, y - 52);
    ctx.quadraticCurveTo(x - 6, y - 57, x - 1, y - 57);
    ctx.lineTo(x - 1, y - 55);
    ctx.quadraticCurveTo(x - 4, y - 55, x - 4, y - 51);
    ctx.closePath();
    ctx.fill();
    // Hat band — accent stripe around the base of the crown.
    ctx.fillStyle = hatColorDk;
    ctx.fillRect(x - 7, y - 50, 14, 2);
    // Hat feather/pin — small accent on the side, biome-agnostic so the
    // character is identifiable in any world.
    ctx.fillStyle = this.isP2 ? '#9be7ff' : palette!.accent;
    ctx.beginPath();
    ctx.arc(x + this.facing * 5, y - 50, 1.5, 0, Math.PI * 2);
    ctx.fill();

    // Face — drawn AFTER the hat brim so the brim casts a slight shadow on
    // the upper face (handled by the band shadow ellipse above).
    // Big single eye — bold and readable. Position favors the facing side.
    ctx.fillStyle = '#0a1832';
    ctx.beginPath();
    ctx.arc(x + this.facing * 2, y - 41, 2.2, 0, Math.PI * 2);
    ctx.fill();
    // Eye sparkle — small white dot in the upper-left of the pupil.
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(x + this.facing * 2 - 0.7, y - 41.6, 0.9, 0, Math.PI * 2);
    ctx.fill();
    // Mouth — short curved line. Determined smirk facing the action.
    ctx.strokeStyle = '#5a2a14';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x + this.facing * 0.5, y - 36);
    ctx.quadraticCurveTo(x + this.facing * 3, y - 35, x + this.facing * 4.5, y - 36);
    ctx.stroke();
    // Nose nub — tiny shaded curve, adds character.
    ctx.strokeStyle = 'rgba(80,40,20,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + this.facing * 4, y - 39);
    ctx.lineTo(x + this.facing * 5, y - 37);
    ctx.stroke();
    // Gun / harpoon launcher — slightly redesigned with a barrel + grip.
    ctx.fillStyle = '#2a323c';
    ctx.strokeStyle = '#0a1832';
    ctx.lineWidth = 1;
    roundRect(ctx, x - 3, y - 38, 6, 13, 1.5, true, true);
    // Barrel pointing in facing direction.
    ctx.fillStyle = '#1a2028';
    ctx.fillRect(x - 2 + this.facing * 4, y - 41, 4, 7);
    // Tiny accent rim on the barrel tip — biome-agnostic gold/cyan distinction.
    ctx.fillStyle = this.isP2 ? '#9be7ff' : palette!.accent;
    ctx.fillRect(x + this.facing * 7, y - 40, 2, 4);

    // Soft rim light on the facing side — helps the silhouette pop against
    // dark backgrounds (volcano, boss) without needing a hard outline.
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    // Rim along the leading edge of head + torso
    if (this.facing > 0) {
      ctx.moveTo(x + 8, y - 45);
      ctx.quadraticCurveTo(x + 11, y - 38, x + 13, y - 34);
      ctx.lineTo(x + 13, y - 14);
    } else {
      ctx.moveTo(x - 8, y - 45);
      ctx.quadraticCurveTo(x - 11, y - 38, x - 13, y - 34);
      ctx.lineTo(x - 13, y - 14);
    }
    ctx.stroke();
    ctx.restore();

    // Shield aura
    if (this.shield) {
      ctx.strokeStyle = `hsla(${(performance.now() / 6) % 360}, 100%, 70%, 0.8)`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y - 22, 26, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Bird-stun: spinning star indicator above head while weapons are locked.
    // Telegraphs to the player exactly why their shots aren't coming out.
    if (this.weaponDisabled > 0) {
      const t = performance.now() / 200;
      ctx.save();
      ctx.translate(x, y - 56);
      ctx.rotate(t);
      ctx.fillStyle = '#ffd60a';
      ctx.strokeStyle = '#5b3500';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const ang = (i / 5) * Math.PI * 2;
        const r = i % 2 === 0 ? 7 : 3;
        ctx.lineTo(Math.cos(ang) * r, Math.sin(ang) * r);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // Flame muzzle visual (additional flair beyond the projectiles)
    if (this.flameActive) {
      const m = this.getMuzzle();
      ctx.fillStyle = '#ffeb3b';
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.arc(m.x, m.y - 6, 8 + Math.random() * 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
}
