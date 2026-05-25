import { CEILING_Y, GROUND_Y, H, State, W, type BallType, type DailyModifierId, type DeathReason, type GameMode, type GameState, type ThemeName } from './constants';
import { LEVELS } from './data/levels';
import { Ball } from './entities/ball';
import { Boss } from './entities/boss';
import { Crab } from './entities/crab';
import { Creature, type CreatureKind } from './entities/creature';
import { Destructible } from './entities/destructible';
import { Hazard } from './entities/hazard';
import { Particle, FloatingText, Shockwave, SmokeCloud } from './entities/particle';
import { Pickup } from './entities/pickup';
import { Platform } from './entities/platform';
import { Player } from './entities/player';
import { Projectile } from './entities/projectile';
import { emit } from './systems/analytics';
import { AudioSys } from './systems/audio';
import { clearLevel, explodeProjectile, killPlayer, popBall } from './systems/combat';
import { consumePressed, flushHoverSound, keysPressed, pointer } from './systems/input';
import { Storage } from './systems/storage';
import { pickDailyChallenge, type DailyPick } from './systems/daily';
import { advanceMissions, getWeeklyEvent, recordWeeklyPanic } from './systems/retention';
// Aliased to Sdk to avoid colliding with the `Platform` entity class above.
import { Platform as Sdk } from './systems/platform';
import { clamp, rand, randi } from './utils';
import { UI } from './ui/domRoot';

// State-handler modules. Each owns its own update() and render() entry points.
import { updateMainMenu,    renderMainMenu }                     from './state/mainMenu';
import { updateModeSelect,  renderModeSelect }                   from './state/modeSelect';
import { updateLevelSelect, renderLevelSelect }                  from './state/levelSelect';
import { updateControls,    renderControls,
         updateHighScores,  renderHighScores,
         updateCredits,     renderCredits,
         updateStats,       renderStats,
         updateProfile,     renderProfile }                         from './state/infoScreens';
import { updatePlaying,     renderWorld }                         from './state/playing';
import { updatePaused,      renderPause }                         from './state/pause';
import { updateLevelClear,  renderLevelClear,
         updateBossDefeated, renderBossDefeated,
         updateVictory,     renderVictory }                       from './state/levelClear';
import { updatePlayerDead, updateGameOver, renderGameOver }       from './state/gameOver';
import { updateDailyIntro,  renderDailyIntro,
         updateDailyResult, renderDailyResult }                   from './state/daily';

// ============================ GAME ==================================
export interface LevelSummary {
  base: number;
  time: number;
  accuracy: number;
  combo: number;
  noMiss: number;
  total: number;
  best: number;
  /** Trick count earned this run (CLUTCH, AIR POP, etc). Optional — when
   *  zero, the summary card hides the row entirely. */
  tricks: number;
  /** True when this run's max combo exceeded the player's all-time best,
   *  so the level-clear card can celebrate the moment. */
  newComboBest: boolean;
}

/**
 * The Game class is now a thin orchestrator. It owns all run-time state
 * (entity arrays, score, timers, daily-challenge state) and lifecycle
 * methods that mutate it. Per-state input/render logic lives in `src/state/*`;
 * per-system logic (collisions, HUD, platform SDK) lives in `src/systems/*`.
 */
export class Game {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  state: GameState;
  t: number;
  lastTime: number;
  mode: GameMode;
  levelIndex: number;
  unlockedLevel: number;
  player: Player | null;
  player2: Player | null;
  balls: Ball[];
  projectiles: Projectile[];
  pickups: Pickup[];
  platforms: Platform[];
  destructibles: Destructible[];
  hazards: Hazard[];
  particles: Particle[];
  shockwaves: Shockwave[];
  smokeClouds: SmokeCloud[];
  floatingTexts: FloatingText[];
  crabs: Crab[];
  creatures: Creature[];
  boss: Boss | null;
  /** Boss Rush queue (boss-level indices remaining). When non-empty we cycle
   *  through and progress to victory when the queue empties. */
  bossRushQueue: number[];
  /** Boss Rush running tally — bosses defeated this run. */
  bossRushCount: number;
  /** Panic-mode endless-survival progress bar (Pang's Rainbow Gauge). Fills
   *  with each pop; on overflow we award a wave-clear bonus and bump up. */
  panicGauge: number;
  panicGaugeMax: number;
  /** Panic-mode Star Bubble countdown — the bubble periodically drops on its own
   *  even if no balls remain, so the player gets the screen-clear option. */
  panicStarTimer: number;
  score: number;
  lives: number;
  timer: number;
  combo: number;
  maxCombo: number;
  shotsHit: number;
  shotsFired: number;
  comboDecay: number;
  theme: ThemeName;
  targetScore: number;
  levelName: string;
  bossLevel: boolean;
  shake: number;
  flash: number;
  slowTime: number;
  freezeTime: number;
  magnetTime: number;
  comboBoostTime: number;
  hitPause: number;
  bossDefeatedTimer: number;
  lastTimerWarning: number;
  accumulator: number;
  fixedStep: number;
  panicWave: number;
  panicSpawnTimer: number;
  menuIndex: number;
  levelSelectIndex: number;
  modeSelectIndex: number;
  introTimer: number;
  introText: string;
  /** Optional override for the intro banner title. When empty, the banner
   *  falls back to {@link levelName}. Used by mode-specific framing (Score
   *  Attack, Panic) so the banner header reads as the mode, not the level. */
  introTitle: string;
  summary: LevelSummary | null;
  daily: DailyPick | null;
  dailyResultScore: number;
  dailyResultShareCopied: number;
  modifier: DailyModifierId | null;
  lastState: GameState;
  sessionLevelsCleared: number;
  awaitingAd: boolean;
  rewardedOffered: boolean;
  usedRewardedContinue: boolean;
  lastDeathReason: DeathReason | null; // what killed the player this run (for the game-over screen)
  sessionFirstPopEmitted: boolean;     // emit `first_pop` analytics event exactly once per page session
  // Multi-pop chain state: a sliding window that closes after ~180ms of no
  // new pops. When the window closes with chainCount >= 2 we emit ONE
  // DOUBLE/TRIPLE/MEGA POP label at the chain centroid — see playing.ts.
  chainCount: number;
  chainTimer: number;
  chainCx: number;
  chainCy: number;
  /** Tricks earned this run (CLUTCH, AIR POP, etc). Surfaced in the
   *  level-clear summary card so the player sees what they pulled off. */
  runTricks: number;
  /** Snapshot of lifetimeMaxCombo at the start of this level/run. After the
   *  run we compare run maxCombo against this to surface NEW COMBO BEST! */
  preRunMaxCombo: number;
  /** Age of the first-run control hint, or -1 when inactive. */
  firstRunHintAge: number;

  constructor() {
    const canvas = document.getElementById('game');
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Expected #game canvas element to exist.');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context is not available.');
    this.canvas = canvas;
    this.ctx = ctx;
    this.state = State.MAIN_MENU;
    this.t = 0;
    this.lastTime = 0;

    this.mode = 'tour';
    this.levelIndex = 0;
    this.unlockedLevel = 0;

    this.player = null;
    this.player2 = null;
    this.balls = [];
    this.projectiles = [];
    this.pickups = [];
    this.platforms = [];
    this.destructibles = [];
    this.hazards = [];
    this.particles = [];
    this.shockwaves = [];
    this.smokeClouds = [];
    this.floatingTexts = [];
    this.crabs = [];
    this.creatures = [];
    this.boss = null;
    this.bossRushQueue = [];
    this.bossRushCount = 0;
    this.panicGauge = 0;
    this.panicGaugeMax = 12;
    this.panicStarTimer = 0;

    this.score = 0;
    this.lives = 3;
    this.timer = 60;
    this.combo = 0;
    this.maxCombo = 0;
    this.shotsHit = 0;
    this.shotsFired = 0;
    this.comboDecay = 0;
    this.theme = 'beach';
    this.targetScore = 0;
    this.levelName = '';
    this.bossLevel = false;

    this.shake = 0;
    this.flash = 0;
    this.slowTime = 0;
    this.freezeTime = 0;
    this.magnetTime = 0;
    this.comboBoostTime = 0;
    this.hitPause = 0;
    this.bossDefeatedTimer = 0;
    this.lastTimerWarning = 0;
    this.accumulator = 0;
    this.fixedStep = 1 / 60;

    this.panicWave = 0;
    this.panicSpawnTimer = 0;

    this.menuIndex = 0;
    this.levelSelectIndex = 0;
    this.modeSelectIndex = 0;

    this.introTimer = 0;
    this.introText = '';
    this.introTitle = '';
    this.summary = null;

    this.daily = null;
    this.dailyResultScore = 0;
    this.dailyResultShareCopied = 0;
    this.modifier = null;

    this.lastState = this.state;
    this.sessionLevelsCleared = 0;
    this.awaitingAd = false;
    this.rewardedOffered = false;
    this.usedRewardedContinue = false;
    this.lastDeathReason = null;
    this.sessionFirstPopEmitted = false;
    this.chainCount = 0;
    this.chainTimer = 0;
    this.chainCx = 0;
    this.chainCy = 0;
    this.runTricks = 0;
    this.preRunMaxCombo = 0;
    this.firstRunHintAge = -1;
  }

  // ============================ LIFECYCLE ============================
  /** Reset per-run flags that should not survive across separate runs. */
  _resetRunFlags() {
    this.usedRewardedContinue = false;
    this.rewardedOffered = false;
    this.awaitingAd = false;
    this.lastDeathReason = null;
  }

  startTour(levelIndex = 0) {
    this.mode = 'tour';
    emit('mode.start', { mode: this.mode, level: levelIndex });
    this.modifier = null;
    this.lives = 3;
    this.score = 0;
    this._resetRunFlags();
    this.loadLevel(levelIndex);
  }

  startScoreAttack() {
    this.mode = 'score_attack';
    emit('mode.start', { mode: this.mode });
    this.modifier = null;
    this.lives = 3;
    this.score = 0;
    this._resetRunFlags();
    this.loadLevel(0);
    // Mode-specific onboarding callout: overrides the level's intro banner
    // header (via introTitle) so the player sees what mode they're playing
    // for, not the level name. Falls through to the GO! beat on dismiss.
    const best = Storage.data.bestScoreAttack || 0;
    this.introTitle = 'SCORE ATTACK';
    this.introText = best > 0
      ? 'Beat your best: ' + best.toLocaleString()
      : 'Cycle the levels. Set your first best.';
    this.introTimer = 3;
  }

  openDaily() {
    this.daily = pickDailyChallenge();
    emit('daily.open', { day: this.daily.date, modifier: this.daily.modifierId });
    this.state = State.DAILY_INTRO;
  }

  startDaily() {
    if (!this.daily) this.daily = pickDailyChallenge();
    this.mode = 'daily';
    emit('mode.start', { mode: this.mode, day: this.daily.date, modifier: this.daily.modifierId });
    this.modifier = this.daily.modifierId;
    this.lives = this.modifier === 'sudden_death' ? 1 : 3;
    this.score = 0;
    this.dailyResultScore = 0;
    this.dailyResultShareCopied = 0;
    this._resetRunFlags();
    this.loadLevel(this.daily.levelIndex);
  }

  startBossRush() {
    // The Boss Rush queues every boss-flagged level in the game (currently just
    // Commander RIFT, but the loop is forward-compatible with future bosses).
    const bossIndices: number[] = [];
    for (let i = 0; i < LEVELS.length; i++) if (LEVELS[i].boss) bossIndices.push(i);
    // Repeat the boss roster so the run has at least 3 fights — gives the mode
    // arcade pacing instead of a single encounter that ends instantly.
    while (bossIndices.length < 3) bossIndices.push(...bossIndices);
    this.mode = 'boss_rush';
    emit('mode.start', { mode: this.mode });
    this.modifier = null;
    this.lives = 3;
    this.score = 0;
    this._resetRunFlags();
    this.bossRushQueue = bossIndices.slice(1);
    this.bossRushCount = 0;
    this.loadLevel(bossIndices[0]);
    this.introTitle = 'BOSS RUSH';
    this.introText = 'Defeat every boss in sequence. No retries between fights.';
    this.introTimer = 4;
  }

  startPanic() {
    this.mode = 'panic';
    emit('mode.start', { mode: this.mode, weekly: getWeeklyEvent().id });
    this.modifier = null;
    this.lives = 3;
    this.score = 0;
    this._resetRunFlags();
    this.panicWave = 0;
    this.theme = 'boss';
    this.levelName = 'PANIC MODE';
    this.targetScore = 0;
    this.timer = 999;
    this.balls = []; this.projectiles = []; this.pickups = [];
    this.platforms = []; this.destructibles = []; this.hazards = [];
    this.particles = []; this.shockwaves = []; this.smokeClouds = []; this.floatingTexts = []; this.crabs = [];
    this.creatures = [];
    this.panicGauge = 0;
    this.panicStarTimer = 22;
    this.player = new Player(W / 2, GROUND_Y - 0);
    this.player2 = null;
    this.boss = null;
    this.bossLevel = false;
    this.state = State.PLAYING;
    this.advancePanicWave();
    // Mode-specific framing — Panic has no per-level intro otherwise. Set
    // *after* advancePanicWave so the wave-1 levelName doesn't overwrite
    // the intro banner header (it doesn't anymore, but order makes intent
    // obvious to a future reader).
    const best = Storage.data.bestPanicWave || 0;
    const weekly = getWeeklyEvent();
    this.introTitle = 'PANIC MODE';
    this.introText = best > 0
      ? weekly.label + ': ' + weekly.goalLabel + '\nBest: Wave ' + best
      : weekly.label + ': ' + weekly.goalLabel + '\nHow long can you last?';
    this.introTimer = 3;
  }

  advancePanicWave() {
    this.panicWave++;
    this.levelName = 'Panic Wave ' + this.panicWave;
    AudioSys.levelClear();
    this.floatingTexts.push(new FloatingText(W / 2, H / 2, 'WAVE ' + this.panicWave, '#ffd60a', 48));
    const count = Math.min(2 + Math.floor(this.panicWave / 2), 8);
    const minSize = clamp(2 - Math.floor(this.panicWave / 5), 0, 2);
    const maxSize = clamp(3 + Math.floor(this.panicWave / 4), 3, 4);
    const specials: BallType[] = ['normal','normal','electric','explosive','smoke','sludge','armored','lava'];
    for (let i = 0; i < count; i++) {
      const size = randi(minSize, maxSize);
      const types: BallType[] = this.panicWave < 3 ? ['normal'] : specials.slice(0, Math.min(specials.length, 2 + Math.floor(this.panicWave / 2)));
      const type = types[randi(0, types.length - 1)];
      this.balls.push(new Ball(rand(80, W - 80), CEILING_Y + 40, size, type, rand(-150, 150), 0));
    }
    if (this.panicWave % 3 === 0) {
      this.pickups.push(new Pickup(W / 2 + rand(-200, 200), H / 2, 'shield'));
    }
    if (this.panicWave % 5 === 0) {
      this.hazards.push(new Hazard('falling_rock', rand(80, W - 120), CEILING_Y + 10, 28, 28, 6));
    }
  }

  loadLevel(index: number) {
    if (index >= LEVELS.length) {
      this.state = State.VICTORY;
      return;
    }
    const L = LEVELS[index];
    this.levelIndex = index;
    this.theme = L.theme;
    this.timer = L.timeLimit;
    this.targetScore = L.targetScore;
    this.levelName = L.name;
    this.bossLevel = !!L.boss;
    this.introText = L.intro || '';
    this.introTimer = L.intro ? 4 : 0;
    this.introTitle = '';

    // Apply daily modifier transformations as the level is built.
    const bigBubbles = this.modifier === 'big_bubbles';
    const noPickups  = this.modifier === 'no_pickups';

    // First-ever-session Level-1 onboarding: slow horizontal velocity by 35%
    // on the absolute first run so a brand-new player has time to read the
    // ball, move under it, and shoot. After the very first pop the player has
    // celebrated, this branch is permanently inactive (sticky save flag).
    const firstEver = !Storage.data.firstPopCelebrated
      && this.mode === 'tour'
      && index === 0;
    this.firstRunHintAge = firstEver ? 0 : -1;

    this.balls = L.balls.map(b => new Ball(
      b.x, b.y,
      bigBubbles ? Math.min(4, (b.size ?? 2) + 1) : b.size,
      b.type || 'normal',
      firstEver ? (b.vx || 0) * 0.65 : (b.vx || 0),
      b.vy || 0,
    ));
    this.platforms = (L.platforms || []).map(p => new Platform(p.x, p.y, p.w, p.h, p));
    this.destructibles = (L.destructibles || []).map(d => new Destructible(d.x, d.y, d.w, d.h, noPickups ? null : d.contains));
    this.pickups = noPickups ? [] : (L.pickups || []).map(p => new Pickup(p.x, p.y, p.type));
    this.hazards = (L.hazards || []).map(h => new Hazard(h.type, h.x, h.y, h.w, h.h, h.life ?? 999));
    this.projectiles = [];
    this.particles = [];
    this.shockwaves = [];
    this.smokeClouds = [];
    this.floatingTexts = [];
    this.crabs = (L.crabs || []).map(c => new Crab(c.x, (c as any).y ?? GROUND_Y, c.minX, c.maxX, c.speed));
    // Creatures spawn on a per-level basis (data field) or are added at
    // runtime by Panic / Boss Rush spawners.
    this.creatures = ((L as any).creatures || []).map((c: any) =>
      new Creature(c.kind as CreatureKind, c.x, c.y ?? (c.kind === 'dragon' ? GROUND_Y : 180), c.dir ?? 1));
    this.combo = 0; this.maxCombo = 0;
    this.shotsHit = 0; this.shotsFired = 0;
    this.chainCount = 0; this.chainTimer = 0;
    this.runTricks = 0;
    this.preRunMaxCombo = Storage.data.lifetimeMaxCombo || 0;
    this.shake = 0; this.flash = 0; this.slowTime = 0; this.freezeTime = 0; this.magnetTime = 0; this.comboBoostTime = 0; this.hitPause = 0;
    this.bossDefeatedTimer = 0; this.lastTimerWarning = 0;
    this.player = new Player(W / 2, GROUND_Y);
    this.player2 = null;
    this.boss = L.boss ? new Boss() : null;
    this.state = State.PLAYING;

    // Attach context to the CrazyGames feedback widget so any in-game user
    // reports include the moment they were in when something broke. No-op if
    // the SDK is absent.
    Sdk.setGameContext({
      mode: this.mode,
      level: this.levelIndex + 1,
      levelId: L.id,
      theme: L.theme,
      modifier: this.modifier ?? null,
    });
  }

  // ============================ HELPERS ============================
  addScore(n: number) { this.score += n; }

  getLivingPlayers() {
    return [this.player, this.player2].filter((p): p is Player => !!p && !p.dead);
  }

  /** Hurtbox used for ball/hazard/crab/boss collisions. Tiny-hurtbox modifier
   *  shrinks the rect symmetrically around the visual hitbox center. */
  getPlayerHurtbox(player: Player) {
    const hb = player.getHitbox();
    if (this.modifier !== 'tiny_hurtbox') return hb;
    const scale = 0.55;
    const cx = hb.x + hb.w / 2, cy = hb.y + hb.h / 2;
    const w = hb.w * scale, h = hb.h * scale;
    return { x: cx - w / 2, y: cy - h / 2, w, h };
  }

  joinPlayer2() {
    if (this.player2 || this.state !== State.PLAYING) return;
    this.player2 = new Player(W / 2 + 64, GROUND_Y, true);
    this.player2.invuln = 2;
    this.floatingTexts.push(new FloatingText(W / 2, H / 2 + 46, 'PLAYER 2 JOINED', '#9be7ff', 24));
    AudioSys.pickup();
  }

  respawnPlayer(player: Player) {
    player.x = player.isP2 ? W / 2 + 64 : W / 2 - 64;
    player.y = GROUND_Y;
    player.vx = 0;
    player.dead = false;
    player.respawnTimer = 0;
    player.invuln = 2;
    player.setWeapon('harpoon');
  }

  saveRunBest() {
    let beatSomePB = false;
    if (this.mode === 'score_attack' && this.score > Storage.data.bestScoreAttack) {
      Storage.data.bestScoreAttack = this.score;
      Storage.save();
      beatSomePB = true;
    }
    if (this.mode === 'panic') {
      const survivedWave = this.panicWave - 1;
      advanceMissions('panic_wave', 1, Math.max(0, survivedWave));
      advanceMissions('score', 1, this.score);
      recordWeeklyPanic(this.score, Math.max(0, survivedWave));
      if (survivedWave > Storage.data.bestPanicWave) {
        Storage.data.bestPanicWave = survivedWave;
        beatSomePB = true;
      }
      if (this.score > Storage.data.bestPanicScore) {
        Storage.data.bestPanicScore = this.score;
        beatSomePB = true;
      }
      Storage.save();
      if (this.score > (Storage.data.leaderboardPanicSubmitted || 0)) {
        const submittedScore = this.score;
        Sdk.submitLeaderboardScore(submittedScore).then(ok => {
          if (!ok) return;
          Storage.data.leaderboardPanicSubmitted = Math.max(Storage.data.leaderboardPanicSubmitted || 0, submittedScore);
          Storage.save();
        });
      }
    }
    if (this.mode === 'boss_rush') {
      if (this.score > (Storage.data.bestBossRush || 0)) {
        Storage.data.bestBossRush = this.score;
        beatSomePB = true;
      }
      if (this.bossRushCount > (Storage.data.bestBossRushCount || 0)) {
        Storage.data.bestBossRushCount = this.bossRushCount;
        beatSomePB = true;
      }
      Storage.save();
    }
    // happytime() signals a player-satisfaction peak to CrazyGames. We fire
    // it on genuine personal-best moments only — overusing it makes the
    // signal meaningless and the platform discounts it.
    if (beatSomePB) Sdk.happytime();
  }

  // Combat reactions live in src/systems/combat.ts; these methods are thin
  // delegations so existing callers (entities, collisions, state handlers)
  // keep the same `game.method(...)` surface.
  _popBall(ball: Ball, source: any) { popBall(this, ball, source); }
  explodeProjectile(projectile: Projectile, x: number, y: number) { explodeProjectile(this, projectile, x, y); }
  killPlayer(player: Player, reason: DeathReason = 'unknown') { killPlayer(this, player, reason); }
  levelClear() { clearLevel(this); }

  // ============================ MAIN LOOP ============================
  start() {
    requestAnimationFrame(this.frame.bind(this));
  }

  frame(time: number) {
    const dt = Math.min(0.1, (time - this.lastTime) / 1000) || 0;
    this.lastTime = time;
    this.t += dt;
    this.accumulator += dt;
    let steps = 0;
    while (this.accumulator >= this.fixedStep && steps < 5) {
      this.update(this.fixedStep);
      this.accumulator -= this.fixedStep;
      steps++;
    }
    if (steps === 5) this.accumulator = 0;
    this.render();
    requestAnimationFrame(this.frame.bind(this));
  }

  update(dt: number) {
    // Mute toggle works in every state.
    if (consumePressed('KeyM')) AudioSys.toggle();

    // Decay shake/flash globally so they don't get stuck while a non-PLAYING
    // state (e.g. PLAYER_DEAD's hit-pause) holds the gameplay update path.
    // Without this, a player death set `shake = 18` would jitter forever until
    // respawn because updatePlaying's decay tick never ran.
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 30);
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt);

    switch (this.state) {
      case State.MAIN_MENU:    updateMainMenu(this); break;
      case State.MODE_SELECT:  updateModeSelect(this); break;
      case State.LEVEL_SELECT: updateLevelSelect(this); break;
      case State.HIGH_SCORES:  updateHighScores(this); break;
      case State.CONTROLS:     updateControls(this); break;
      case State.CREDITS:      updateCredits(this); break;
      case State.STATS:        updateStats(this); break;
      case State.PROFILE:      updateProfile(this); break;
      case State.PLAYING:      updatePlaying(this, dt); break;
      case State.PAUSED:       updatePaused(this); break;
      case State.LEVEL_CLEAR:  updateLevelClear(this); break;
      case State.PLAYER_DEAD:  updatePlayerDead(this, dt); break;
      case State.GAME_OVER:    updateGameOver(this); break;
      case State.BOSS_DEFEATED:updateBossDefeated(this, dt); break;
      case State.VICTORY:      updateVictory(this); break;
      case State.DAILY_INTRO:  updateDailyIntro(this); break;
      case State.DAILY_RESULT: updateDailyResult(this); break;
    }

    // Clear per-frame edge buffers.
    for (const k in keysPressed) keysPressed[k] = false;
    pointer.pressed = false;

    // Platform state-change watcher: fire gameplayStart/Stop on PLAYING transitions.
    if (this.state !== this.lastState) {
      const wasPlaying = this.lastState === State.PLAYING;
      const isPlaying  = this.state === State.PLAYING;
      if (!wasPlaying && isPlaying) {
        Sdk.gameplayStart();
        emit('gameplay.start', { mode: this.mode, level: this.levelIndex, modifier: this.modifier });
      }
      if (wasPlaying && !isPlaying) {
        Sdk.gameplayStop();
        emit('gameplay.stop', { to: this.state });
      }
      this.lastState = this.state;
    }
  }

  render() {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // Shake offset (suppressed entirely when the accessibility flag is set).
    // SHAKE_SCALE damps every call site uniformly — individual values in
    // combat/ball/pickup/boss were tuned hot; this is the global mix knob.
    let sx = 0, sy = 0;
    if (this.shake > 0 && !Storage.data.reducedMotion) {
      const SHAKE_SCALE = 0.5;
      const amp = this.shake * SHAKE_SCALE;
      sx = rand(-amp, amp);
      sy = rand(-amp, amp);
    }
    ctx.translate(sx, sy);

    switch (this.state) {
      case State.MAIN_MENU:    renderMainMenu(this); break;
      case State.MODE_SELECT:  renderModeSelect(this); break;
      case State.LEVEL_SELECT: renderLevelSelect(this); break;
      case State.HIGH_SCORES:  renderHighScores(this); break;
      case State.CONTROLS:     renderControls(this); break;
      case State.CREDITS:      renderCredits(this); break;
      case State.STATS:        renderStats(this); break;
      case State.PROFILE:      renderProfile(this); break;
      case State.DAILY_INTRO:  renderDailyIntro(this); break;
      case State.DAILY_RESULT: renderDailyResult(this); break;
      case State.PLAYING:
      case State.PAUSED:
      case State.PLAYER_DEAD:
      case State.LEVEL_CLEAR:
      case State.GAME_OVER:
      case State.BOSS_DEFEATED:
      case State.VICTORY:
        renderWorld(this);
        if (this.state === State.PAUSED)        renderPause(this);
        if (this.state === State.LEVEL_CLEAR)   renderLevelClear(this);
        if (this.state === State.GAME_OVER)     renderGameOver(this);
        if (this.state === State.BOSS_DEFEATED) renderBossDefeated(this);
        if (this.state === State.VICTORY)       renderVictory(this);
        break;
    }

    // Global flash overlay — capped to a barely-visible tint in reduced-motion mode.
    if (this.flash > 0) {
      const cap = Storage.data.reducedMotion ? 0.06 : 0.5;
      ctx.globalAlpha = clamp(this.flash, 0, cap);
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }

    // After all state-specific renders had a chance to call pointerOver(),
    // emit a single hover SFX if the cursor crossed onto a new button.
    flushHoverSound();

    // Sync the HTML/CSS overlay: flips visible screen on state change,
    // re-tints biome palette tokens, and runs the active screen's
    // per-frame update (cheap; guarded writes only on changed values).
    UI.syncFrame(this);
  }
}
