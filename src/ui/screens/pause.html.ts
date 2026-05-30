/**
 * Pause overlay. Renders on top of the still-visible gameplay canvas.
 */

import { State } from '../../constants';
import { AudioSys } from '../../systems/audio';
import { isTouchDevice } from '../../systems/input';
import { Storage } from '../../systems/storage';
import { activeMissions } from '../../systems/retention';
import { computeAccountLevel } from '../../systems/progression';
import type { Game } from '../../game';

function restartCurrentRun(game: Game) {
  if (game.mode === 'panic') return game.startPanic();
  if (game.mode === 'score_attack') return game.startScoreAttack();
  return game.loadLevel(game.levelIndex);
}

export function buildPause(game: Game): HTMLElement {
  const root = document.createElement('section');
  root.className = 'ui-screen pause overlay-screen';
  root.setAttribute('data-screen', 'paused');
  root.setAttribute('aria-label', 'Paused');

  const card = document.createElement('div');
  card.className = 'overlay-card';
  card.innerHTML = `
    <h2 class="ui-heading ui-heading--display overlay-card__title">Paused</h2>
    <div class="overlay-card__sub" data-role="level-name"></div>

    <div class="pause__progress" data-role="progress" style="display:flex;flex-direction:column;gap:6px;margin:4px 0;"></div>

    <div class="ui-card pause__controls-card" style="padding: 14px;">
      <div style="font-size: var(--fs-micro); letter-spacing: 0.16em; opacity: 0.6; text-transform: uppercase; margin-bottom: 8px;">Controls</div>
      <div data-role="controls" style="display:flex;flex-direction:column;gap:6px;font-size:var(--fs-small);"></div>
    </div>

    <div class="pause__toggle" data-role="reduced">
      <span>Reduced motion</span>
      <div class="pause__toggle-switch"></div>
    </div>
    <div class="pause__toggle" data-role="mute">
      <span>Sound</span>
      <div class="pause__toggle-switch"></div>
    </div>

    <div class="pause__mobile-settings" data-role="mobile-settings" hidden>
      <div class="pause__section-label">Mobile controls</div>
      <div class="pause__toggle" data-role="haptics">
        <span>Vibration</span>
        <div class="pause__toggle-switch"></div>
      </div>
    </div>

    <div class="overlay-card__actions">
      <button type="button" class="ui-btn ui-btn--ghost" data-role="restart">Restart</button>
      <button type="button" class="ui-btn ui-btn--cta"   data-role="resume">Resume</button>
      <button type="button" class="ui-btn ui-btn--ghost" data-role="menu">Main Menu</button>
    </div>
    <div class="overlay-card__hint">P or Esc to resume</div>
  `;
  root.appendChild(card);

  card.querySelector<HTMLElement>('[data-role="resume"]')!.addEventListener('click', () => {
    AudioSys.menu(); game.state = State.PLAYING;
  });
  card.querySelector<HTMLElement>('[data-role="restart"]')!.addEventListener('click', () => {
    AudioSys.menu(); restartCurrentRun(game);
  });
  card.querySelector<HTMLElement>('[data-role="menu"]')!.addEventListener('click', () => {
    AudioSys.menu(); game.state = State.MAIN_MENU;
  });
  card.querySelector<HTMLElement>('[data-role="reduced"]')!.addEventListener('click', () => {
    AudioSys.menu();
    Storage.data.reducedMotion = !Storage.data.reducedMotion;
    Storage.save();
  });
  card.querySelector<HTMLElement>('[data-role="mute"]')!.addEventListener('click', () => {
    AudioSys.toggle();
    AudioSys.menu();
  });

  // Mobile-only settings cluster. Hidden on desktop entirely (and the
  // sync function below also keeps it hidden if the user is on a non-touch
  // device, so this doesn't leak into hybrid laptops via a stale build).
  const mobileSettings = card.querySelector<HTMLElement>('[data-role="mobile-settings"]');
  if (isTouchDevice && mobileSettings) {
    mobileSettings.hidden = false;
    card.querySelector<HTMLElement>('[data-role="haptics"]')!.addEventListener('click', () => {
      AudioSys.menu();
      Storage.data.mobileHaptics = !Storage.data.mobileHaptics;
      Storage.save();
    });
  }

  return root;
}

export function syncPause(game: Game, root: HTMLElement) {
  const levelEl = root.querySelector<HTMLElement>('[data-role="level-name"]');
  if (levelEl && levelEl.textContent !== game.levelName) levelEl.textContent = game.levelName;

  // Pause progress summary — honest, non-guilt status of what is still in
  // motion: account level, top 2 daily missions, current run score. Built
  // once per pause-overlay lifecycle (overlay is rebuilt on every entry).
  const prog = root.querySelector<HTMLElement>('[data-role="progress"]');
  if (prog && !prog.dataset.populated) {
    prog.dataset.populated = '1';
    const lvl = computeAccountLevel(Storage.data);
    const lvlPct = Math.max(0, Math.min(100, Math.round(lvl.ratio * 100)));
    const missions = activeMissions().slice(0, 2);
    const rows: string[] = [];
    rows.push(`
      <div class="result-section" style="margin:0;">
        <div class="result-section__label"><span>Account · Lv ${lvl.level}</span><span style="opacity:0.7;">${lvl.inLevel} / ${lvl.xpForCurrent} XP</span></div>
        <div class="result-mission__bar"><span style="width:${lvlPct}%;"></span></div>
      </div>`);
    for (const m of missions) {
      const pct = Math.max(0, Math.min(100, Math.round((m.progress / m.target) * 100)));
      const done = m.progress >= m.target;
      rows.push(`
        <div class="result-mission${done ? ' is-complete' : ''}">
          <div class="result-mission__head">
            <span class="result-mission__label">${m.label}</span>
            <span class="result-mission__count">${Math.min(m.progress, m.target)} / ${m.target}</span>
          </div>
          <div class="result-mission__bar"><span style="width:${pct}%;"></span></div>
        </div>`);
    }
    rows.push(`<div class="overlay-card__hint" style="margin-top:2px;">Progress is saved.</div>`);
    prog.innerHTML = rows.join('');
  }

  const controls = root.querySelector<HTMLElement>('[data-role="controls"]');
  if (controls && !controls.dataset.populated) {
    controls.dataset.populated = '1';
    controls.innerHTML = isTouchDevice
      ? `<div>Tap the <strong>left half</strong> of the screen to move left, <strong>right half</strong> to move right.</div>
         <div>Shots fire automatically.</div>
         <div>Tap the pause icon (top-right) to pause / resume.</div>`
      : `<div><strong>A / ←</strong> · <strong>D / →</strong>  Move</div>
         <div><strong>Space / W / ↑</strong>  Shoot</div>
        <div><strong>P</strong> or <strong>Esc</strong>  Pause     <strong>R</strong>  Restart     <strong>M</strong>  Mute</div>
        <div><strong>PS5</strong>  Left stick / D-pad move  •  Cross shoot  •  Circle / Options pause</div>`;
  }

  const reduced = root.querySelector<HTMLElement>('[data-role="reduced"]');
  if (reduced) reduced.classList.toggle('is-on', !!Storage.data.reducedMotion);
  const mute = root.querySelector<HTMLElement>('[data-role="mute"]');
  if (mute) mute.classList.toggle('is-on', !AudioSys.muted);

  if (isTouchDevice) {
    const hp = root.querySelector<HTMLElement>('[data-role="haptics"]');
    if (hp) hp.classList.toggle('is-on', !!Storage.data.mobileHaptics);
  }
}
