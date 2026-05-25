/**
 * UI router. Owns #ui-root and the visible-screen lifecycle.
 *
 * Architecture:
 *   - At boot, every HTML/CSS screen registers here. Each gets one DOM
 *     tree built once and toggled via `.is-active` (no remount).
 *   - HUD + touch controls + effects overlay are always mounted (they
 *     manage their own visibility).
 *   - Every frame, `UI.syncFrame(game)` runs from game.render(). It:
 *       1. Updates body[data-state] so CSS can react (hides canvas
 *          during pure-UI states).
 *       2. Updates body[data-theme] from game.theme — biome palette
 *          tokens cascade through every HTML surface.
 *       3. Toggles `.is-active` on the screen matching game.state.
 *       4. Runs the active screen's optional sync(game).
 *       5. Runs the HUD's per-frame sync.
 *   - Canvas state-render functions check `UI.isHandledByHtml(state)`
 *     and early-return when the HTML overlay owns the screen.
 */

import { State, type GameState } from '../constants';
import { buildMainMenu, syncMainMenu, tickMainMenuIdleClock } from './screens/mainMenu.html';
import { buildModeSelect, syncModeSelect } from './screens/modeSelect.html';
import { buildLevelSelect, syncLevelSelect } from './screens/levelSelect.html';
import {
  buildControls, buildCredits, buildStats, syncStats,
  buildHighScores, syncHighScores,
} from './screens/infoScreens.html';
import { buildDailyIntro, syncDailyIntro, buildDailyResult, syncDailyResult } from './screens/daily.html';
import { buildPause, syncPause } from './screens/pause.html';
import { buildGameOver, syncGameOver } from './screens/gameOver.html';
import { buildLevelClear, syncLevelClear, buildBossDefeated, buildVictory, syncVictory } from './screens/levelClear.html';
import { buildHUD, syncHUD } from './hud/hud.html';
import { buildTouchControls } from './hud/touchControls.html';
import { initEffects } from './overlay/effects';
import type { Game } from '../game';

interface ScreenEntry {
  state: GameState;
  root: HTMLElement;
  sync?: (game: Game, root: HTMLElement) => void;
}

class UIRoot {
  private container: HTMLElement | null = null;
  private screens: ScreenEntry[] = [];
  private handled = new Set<GameState>();
  private lastState: GameState | null = null;
  private lastTheme: string | null = null;
  private activeScreen: ScreenEntry | null = null;
  private hudRoot: HTMLElement | null = null;

  init(game: Game) {
    const container = document.getElementById('ui-root');
    if (!container) {
      console.warn('UIRoot.init: #ui-root not found in DOM');
      return;
    }
    this.container = container;

    // Effects layer at the bottom of #ui-root so popups paint over
    // gameplay but under foreground screens like pause / game-over.
    container.appendChild(initEffects());

    // Register every HTML screen.
    this.register(State.MAIN_MENU,    buildMainMenu(game),    (g, r) => { tickMainMenuIdleClock(g, r); syncMainMenu(g, r); });
    this.register(State.MODE_SELECT,  buildModeSelect(game),  syncModeSelect);
    this.register(State.LEVEL_SELECT, buildLevelSelect(game), syncLevelSelect);
    this.register(State.CONTROLS,     buildControls());
    this.register(State.CREDITS,      buildCredits());
    this.register(State.STATS,        buildStats(),           syncStats);
    this.register(State.HIGH_SCORES,  buildHighScores(),      syncHighScores);
    this.register(State.DAILY_INTRO,  buildDailyIntro(game),  syncDailyIntro);
    this.register(State.DAILY_RESULT, buildDailyResult(game), syncDailyResult);
    this.register(State.PAUSED,       buildPause(game),       syncPause);
    this.register(State.GAME_OVER,    buildGameOver(game),    syncGameOver);
    this.register(State.LEVEL_CLEAR,  buildLevelClear(game),  syncLevelClear);
    this.register(State.BOSS_DEFEATED,buildBossDefeated(game));
    this.register(State.VICTORY,      buildVictory(game),     syncVictory);

    // HUD + touch controls — always mounted, manage their own visibility.
    this.hudRoot = buildHUD(game);
    container.appendChild(this.hudRoot);
    container.appendChild(buildTouchControls());
  }

  private register(
    state: GameState,
    root: HTMLElement,
    sync?: (game: Game, root: HTMLElement) => void,
  ) {
    if (!this.container) return;
    this.container.appendChild(root);
    this.screens.push({ state, root, sync });
    this.handled.add(state);
  }

  isHandledByHtml(state: GameState): boolean {
    return this.handled.has(state);
  }

  syncFrame(game: Game) {
    if (!this.container) return;

    if (game.state !== this.lastState) {
      document.body.dataset.state = game.state;
      this.lastState = game.state;
      const next = this.screens.find(s => s.state === game.state) ?? null;
      if (next !== this.activeScreen) {
        this.activeScreen?.root.classList.remove('is-active');
        next?.root.classList.add('is-active');
        this.activeScreen = next;
      }
    }

    if (game.theme !== this.lastTheme) {
      document.body.dataset.theme = game.theme;
      this.lastTheme = game.theme;
    }

    if (this.activeScreen?.sync) {
      this.activeScreen.sync(game, this.activeScreen.root);
    }

    // HUD syncs every frame regardless of active screen (it shows during
    // playing/paused/dead/level-clear/etc and self-hides otherwise).
    syncHUD(game);
  }
}

export const UI = new UIRoot();
