/**
 * HTML/CSS HUD — replaces renderHUD in src/systems/hud.ts.
 *
 * Built once at boot, mounted to #ui-root. Updated per-frame by
 * UI.syncFrame() via sync(game). The HUD is always present in the DOM
 * (it has no `.is-active` toggle), and individual sub-elements show/hide
 * based on game state.
 *
 * Performance discipline:
 *   - All per-frame writes guarded by changed-value checks (setText /
 *     toggleClass / setStyle helpers below).
 *   - Effect chips and life pips are diffed against a snapshot, only
 *     rebuilt when the snapshot changes.
 *   - Boss bar / P2 chip use display:none when absent (no children to
 *     update when there's no boss or P2 in play).
 */

import { State, type GameState } from '../../constants';
import { AudioSys } from '../../systems/audio';
import type { Game } from '../../game';

const HUD_STATES: ReadonlySet<GameState> = new Set([
  State.PLAYING, State.PAUSED, State.PLAYER_DEAD,
  State.LEVEL_CLEAR, State.GAME_OVER, State.BOSS_DEFEATED,
]);

interface Refs {
  root: HTMLElement;
  bar: HTMLElement;
  scoreValue: HTMLElement;
  scoreDelta: HTMLElement;        // small "+N" pulse next to the score on each pop
  weaponName: HTMLElement;
  weaponAmmo: HTMLElement;
  shieldChip: HTMLElement;
  timerWrap: HTMLElement;
  timerValue: HTMLElement;
  waveLabel: HTMLElement;
  rainbow: HTMLElement;
  rainbowFill: HTMLElement;
  combo: HTMLElement;
  comboRing: SVGCircleElement;    // foreground ring whose stroke-dashoffset = combo time remaining
  comboValue: HTMLElement;        // the "×N" text portion of the combo chip
  lives: HTMLElement;
  levelName: HTMLElement;
  pauseBtn: HTMLElement;
  bottom: HTMLElement;
  bossWrap: HTMLElement;
  bossLabel: HTMLElement;
  bossFill: HTMLElement;
  p2: HTMLElement;
}

let refs: Refs | null = null;
let cached = {
  score: -1,
  weapon: '',
  weaponAmmo: -1,
  weaponTime: -1,
  shield: false,
  timer: -1,
  timerLow: false,
  panicWave: -1,
  panicRatio: -1,
  combo: -1,
  lives: -1,
  levelName: '',
  bossHpRatio: -1,
  bossVisible: false,
  p2Status: '',
  effectsIds: '',
};

export function buildHUD(game: Game): HTMLElement {
  const root = document.createElement('div');
  root.className = 'hud';
  root.setAttribute('role', 'status');
  root.setAttribute('aria-label', 'Heads-up display');
  root.style.display = 'none';

  root.innerHTML = `
    <div class="hud__bar">
      <div class="hud__left">
        <div class="hud__score-wrap">
          <span class="hud__score-label">SCORE</span>
          <span class="hud__score-value" data-role="score">0000000</span>
          <span class="hud__score-delta" data-role="score-delta"></span>
        </div>
        <div class="hud__weapon-wrap">
          <span class="hud__weapon-name is-default" data-role="weapon-name">HARPOON</span>
          <span class="hud__weapon-ammo" data-role="weapon-ammo"></span>
          <span class="hud__shield-chip" data-role="shield" hidden>● SHIELD</span>
        </div>
        <div class="hud__p2" data-role="p2" hidden></div>
      </div>
      <div class="hud__center">
        <div class="hud__timer-wrap" data-role="timer-wrap">
          <div class="hud__timer-value" data-role="timer-value">60s</div>
        </div>
        <div class="hud__wave-label" data-role="wave-label" hidden></div>
        <div class="hud__rainbow" data-role="rainbow" hidden>
          <div class="hud__rainbow-fill" data-role="rainbow-fill"></div>
        </div>
        <div class="hud__combo" data-role="combo">
          <div class="hud__combo-ring">
            <svg viewBox="0 0 36 36">
              <circle class="hud__combo-ring-bg" cx="18" cy="18" r="16"></circle>
              <circle class="hud__combo-ring-fg" data-role="combo-ring" cx="18" cy="18" r="16" pathLength="100"></circle>
            </svg>
          </div>
          <div class="hud__combo-info">
            <div class="hud__combo-label">COMBO</div>
            <div class="hud__combo-value" data-role="combo-value">×0</div>
          </div>
        </div>
      </div>
      <div class="hud__right">
        <div class="hud__lives" data-role="lives"></div>
        <div class="hud__level-name" data-role="level-name"></div>
      </div>
    </div>
    <button class="hud__pause" type="button" aria-label="Pause" data-role="pause-btn">
      <svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>
    </button>
    <div class="hud__boss" data-role="boss" hidden>
      <div class="hud__boss-label" data-role="boss-label">COMMANDER RIFT</div>
      <div class="hud__boss-bar"><div class="hud__boss-fill" data-role="boss-fill" style="width:100%"></div></div>
    </div>
    <div class="hud__bottom" data-role="bottom"></div>
  `;

  refs = {
    root,
    bar:          root.querySelector('.hud__bar') as HTMLElement,
    scoreValue:   root.querySelector('[data-role="score"]') as HTMLElement,
    scoreDelta:   root.querySelector('[data-role="score-delta"]') as HTMLElement,
    weaponName:   root.querySelector('[data-role="weapon-name"]') as HTMLElement,
    weaponAmmo:   root.querySelector('[data-role="weapon-ammo"]') as HTMLElement,
    shieldChip:   root.querySelector('[data-role="shield"]') as HTMLElement,
    timerWrap:    root.querySelector('[data-role="timer-wrap"]') as HTMLElement,
    timerValue:   root.querySelector('[data-role="timer-value"]') as HTMLElement,
    waveLabel:    root.querySelector('[data-role="wave-label"]') as HTMLElement,
    rainbow:      root.querySelector('[data-role="rainbow"]') as HTMLElement,
    rainbowFill:  root.querySelector('[data-role="rainbow-fill"]') as HTMLElement,
    combo:        root.querySelector('[data-role="combo"]') as HTMLElement,
    comboRing:    root.querySelector('[data-role="combo-ring"]') as unknown as SVGCircleElement,
    comboValue:   root.querySelector('[data-role="combo-value"]') as HTMLElement,
    lives:        root.querySelector('[data-role="lives"]') as HTMLElement,
    levelName:    root.querySelector('[data-role="level-name"]') as HTMLElement,
    pauseBtn:     root.querySelector('[data-role="pause-btn"]') as HTMLElement,
    bottom:       root.querySelector('[data-role="bottom"]') as HTMLElement,
    bossWrap:     root.querySelector('[data-role="boss"]') as HTMLElement,
    bossLabel:    root.querySelector('[data-role="boss-label"]') as HTMLElement,
    bossFill:     root.querySelector('[data-role="boss-fill"]') as HTMLElement,
    p2:           root.querySelector('[data-role="p2"]') as HTMLElement,
  };

  refs.pauseBtn.addEventListener('click', () => {
    AudioSys.menu();
    if (game.state === State.PLAYING) game.state = State.PAUSED;
    else if (game.state === State.PAUSED) game.state = State.PLAYING;
  });

  return root;
}

export function syncHUD(game: Game) {
  if (!refs) return;
  const visible = HUD_STATES.has(game.state);
  if (refs.root.style.display === 'none') {
    if (!visible) return;
    refs.root.style.display = '';
  } else if (!visible) {
    refs.root.style.display = 'none';
    return;
  }

  // ---- Score (with pop animation on increase) ----
  if (game.score !== cached.score) {
    refs.scoreValue.textContent = game.score.toString().padStart(7, '0');
    if (cached.score >= 0 && game.score > cached.score) {
      refs.scoreValue.classList.remove('is-pop');
      // Force reflow so the animation re-triggers on rapid hits.
      void refs.scoreValue.offsetWidth;
      refs.scoreValue.classList.add('is-pop');
    }
    cached.score = game.score;
  }


  // ---- Weapon / ammo / shield ----
  const p = game.player;
  if (p) {
    const wName = p.weapon.toUpperCase();
    if (wName !== cached.weapon) {
      refs.weaponName.textContent = wName;
      refs.weaponName.classList.toggle('is-default', p.weapon === 'harpoon');
      cached.weapon = wName;
    }
    const ammoStr =
      p.weaponAmmo > 0 ? '×' + p.weaponAmmo :
      p.weaponTime > 0 ? Math.ceil(p.weaponTime) + 's' : '';
    if (ammoStr !== (cached.weaponAmmo === -1 && cached.weaponTime === -1 ? '' : (cached.weaponAmmo > 0 ? '×' + cached.weaponAmmo : Math.ceil(cached.weaponTime) + 's'))) {
      refs.weaponAmmo.textContent = ammoStr;
      cached.weaponAmmo = p.weaponAmmo;
      cached.weaponTime = p.weaponTime;
    }
    if (p.shield !== cached.shield) {
      refs.shieldChip.hidden = !p.shield;
      cached.shield = p.shield;
    }
  }

  // ---- Timer or panic wave ----
  const isPanic = game.mode === 'panic';
  refs.timerWrap.style.display = isPanic ? 'none' : '';
  refs.waveLabel.style.display = isPanic ? '' : 'none';
  refs.rainbow.style.display   = isPanic ? '' : 'none';
  if (isPanic) {
    if (game.panicWave !== cached.panicWave) {
      refs.waveLabel.textContent = 'WAVE ' + game.panicWave;
      cached.panicWave = game.panicWave;
    }
    const ratio = Math.max(0, Math.min(1, game.panicGauge / game.panicGaugeMax));
    if (Math.abs(ratio - cached.panicRatio) > 0.001) {
      refs.rainbowFill.style.width = (ratio * 100).toFixed(1) + '%';
      cached.panicRatio = ratio;
    }
  } else {
    const seconds = Math.ceil(game.timer);
    if (seconds !== cached.timer) {
      refs.timerValue.textContent = seconds + 's';
      cached.timer = seconds;
    }
    const low = game.timer < 10;
    if (low !== cached.timerLow) {
      refs.timerWrap.classList.toggle('is-low', low);
      cached.timerLow = low;
    }
  }

  // ---- Combo chip + ring meter ----
  // Combo decay window is 4 seconds (see playing.ts:91) — the ring's
  // foreground stroke-dashoffset interpolates 0 (full) to 100 (empty) as
  // comboDecay drains. We write the offset every frame the combo is
  // active so the drain reads smoothly; the value is cheap to set.
  if (game.combo !== cached.combo) {
    if (game.combo > 1) {
      refs.combo.classList.add('is-visible');
      refs.comboValue.textContent = '×' + game.combo;
      refs.combo.classList.toggle('is-mid', game.combo >= 5 && game.combo < 10);
      refs.combo.classList.toggle('is-hot', game.combo >= 10);
    } else {
      refs.combo.classList.remove('is-visible');
    }
    cached.combo = game.combo;
  }
  if (game.combo > 1) {
    const ratio = Math.max(0, Math.min(1, game.comboDecay / 4));
    const offset = (100 - ratio * 100).toFixed(1);
    if (refs.comboRing.getAttribute('stroke-dashoffset') !== offset) {
      refs.comboRing.setAttribute('stroke-dashoffset', offset);
    }
  }

  // ---- Lives ----
  if (game.lives !== cached.lives) {
    const total = Math.max(game.lives, 3, cached.lives);
    refs.lives.innerHTML = '';
    for (let i = 0; i < total; i++) {
      const pip = document.createElement('span');
      pip.className = 'hud__life' + (i >= game.lives ? ' is-lost' : '');
      refs.lives.appendChild(pip);
    }
    cached.lives = game.lives;
  }

  // ---- Level name ----
  if (game.levelName !== cached.levelName) {
    refs.levelName.textContent = game.levelName;
    cached.levelName = game.levelName;
  }

  // ---- Boss bar ----
  const bossVisible = !!game.boss && !game.boss.dead;
  if (bossVisible !== cached.bossVisible) {
    refs.bossWrap.hidden = !bossVisible;
    cached.bossVisible = bossVisible;
  }
  if (bossVisible && game.boss) {
    const ratio = game.boss.hp / game.boss.maxHp;
    if (Math.abs(ratio - cached.bossHpRatio) > 0.001) {
      refs.bossFill.style.width = (Math.max(0, ratio) * 100).toFixed(1) + '%';
      cached.bossHpRatio = ratio;
    }
  }

  // ---- P2 chip ----
  const p2Status = !game.player2 ? '' :
    game.player2.dead ? 'P2 RESPAWN ' + Math.ceil(game.player2.respawnTimer)
                      : 'P2 ' + game.player2.weapon.toUpperCase();
  if (p2Status !== cached.p2Status) {
    refs.p2.hidden = !p2Status;
    if (p2Status) refs.p2.textContent = p2Status;
    cached.p2Status = p2Status;
  }

  // ---- Effect chips ----
  const effects: { id: string; label: string; cls: string; ratio: number; time?: number }[] = [];
  if (game.slowTime > 0)        effects.push({ id: 'slow',   label: 'SLOW',   cls: 'hud__effect--slow',   ratio: game.slowTime / 5,        time: game.slowTime });
  if (game.freezeTime > 0)      effects.push({ id: 'freeze', label: 'FREEZE', cls: 'hud__effect--freeze', ratio: game.freezeTime / 6,      time: game.freezeTime });
  if (game.magnetTime > 0)      effects.push({ id: 'magnet', label: 'MAGNET', cls: 'hud__effect--magnet', ratio: game.magnetTime / 8,      time: game.magnetTime });
  if (game.comboBoostTime > 0)  effects.push({ id: 'boost',  label: 'BOOST',  cls: 'hud__effect--boost',  ratio: game.comboBoostTime / 8, time: game.comboBoostTime });
  if (game.player && game.player.weaponDisabled > 0) {
    effects.push({ id: 'jammed', label: 'JAMMED', cls: 'hud__effect--jammed', ratio: game.player.weaponDisabled / 3, time: game.player.weaponDisabled });
  }
  if (game.mode === 'boss_rush') effects.push({ id: 'boss', label: 'BOSS ' + (game.bossRushCount + 1), cls: 'hud__effect--boss', ratio: 1 });
  const ids = effects.map(e => e.id).join('|');
  if (ids !== cached.effectsIds) {
    refs.bottom.innerHTML = '';
    for (const e of effects) {
      const chip = document.createElement('div');
      chip.className = 'hud__effect ' + e.cls;
      chip.dataset.effectId = e.id;
      const pct = Math.max(0, Math.min(1, e.ratio)) * 100;
      chip.innerHTML = `
        <span class="hud__effect-label">${e.label}</span>
        ${e.time ? `<span class="hud__effect-time" data-role="effect-time">${Math.ceil(e.time)}s</span>` : ''}
        <span class="hud__effect-bar"><span data-role="effect-bar" style="width:${pct.toFixed(0)}%"></span></span>
      `;
      refs.bottom.appendChild(chip);
    }
    cached.effectsIds = ids;
  } else {
    for (const e of effects) {
      const chip = refs.bottom.querySelector<HTMLElement>(`[data-effect-id="${e.id}"]`);
      if (!chip) continue;
      const time = chip.querySelector<HTMLElement>('[data-role="effect-time"]');
      if (time && e.time) {
        const text = Math.ceil(e.time) + 's';
        if (time.textContent !== text) time.textContent = text;
      }
      const bar = chip.querySelector<HTMLElement>('[data-role="effect-bar"]');
      if (bar) {
        const pct = (Math.max(0, Math.min(1, e.ratio)) * 100).toFixed(0) + '%';
        if (bar.style.width !== pct) bar.style.width = pct;
      }
    }
  }
}

/**
 * Pulse the small "+N" delta tag next to the HUD score. Called by the
 * combat system on every pop so the player sees both the world-space
 * floating "+150" AND a HUD-anchored confirmation of the score gain.
 *
 * Implementation: set the text + force-fire the CSS transition by
 * removing the class, forcing reflow, re-adding it. Same pattern as
 * the score-bump animation.
 */
export function pulseScoreDelta(value: number): void {
  if (!refs) return;
  refs.scoreDelta.textContent = '+' + value;
  // First reset to initial state (opacity 0, no transition) — the .is-fired
  // class disables transitions for the snap, then we remove it next frame
  // so the natural CSS transition (opacity 0.7s, transform 0.7s) runs the
  // float-up + fade-out.
  refs.scoreDelta.classList.add('is-fired');
  // Force reflow so the next class change actually triggers a transition.
  void refs.scoreDelta.offsetWidth;
  refs.scoreDelta.classList.remove('is-fired');
}
