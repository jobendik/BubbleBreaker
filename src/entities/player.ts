import { GROUND_Y, WALL_L, WALL_R, type WeaponType } from '../constants';
import { AudioSys } from '../systems/audio';
import { keys } from '../systems/input';
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

    // Body
    const bodyColor = this.isP2 ? '#34a0a4' : '#3a86ff';
    const bodyDark  = this.isP2 ? '#1d646a' : '#1b4fb8';
    ctx.fillStyle = bodyColor;
    ctx.strokeStyle = '#0a1832';
    ctx.lineWidth = 2;
    // Legs
    ctx.fillRect(x - 9, y - 14, 6, 14);
    ctx.fillRect(x + 3, y - 14, 6, 14);
    ctx.strokeRect(x - 9, y - 14, 6, 14);
    ctx.strokeRect(x + 3, y - 14, 6, 14);
    // Torso with subtle vertical gradient — gives the character depth without
    // changing silhouette or recognizability.
    const torsoGrad = ctx.createLinearGradient(0, y - 36, 0, y - 12);
    torsoGrad.addColorStop(0, bodyColor);
    torsoGrad.addColorStop(1, bodyDark);
    ctx.fillStyle = torsoGrad;
    roundRect(ctx, x - 13, y - 36, 26, 24, 5, true, true);
    // Head
    ctx.fillStyle = '#ffd29a';
    ctx.beginPath();
    ctx.arc(x, y - 42, 9, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    // Eye
    ctx.fillStyle = '#0a1832';
    ctx.fillRect(x + this.facing * 2, y - 44, 3, 3);
    // Gun
    ctx.fillStyle = '#202832';
    ctx.fillRect(x - 3, y - 38, 6, 12);
    ctx.fillRect(x - 2 + this.facing * 4, y - 40, 4, 6);

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
