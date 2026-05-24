import './styles.css';
import { Game } from './game';
import { AudioSys } from './systems/audio';
import { Storage } from './systems/storage';
import { bindCanvasInput } from './systems/input';
import { Platform } from './systems/platform';
import { emit, installErrorHandlers } from './systems/analytics';
import { captureWelcomeBack, setUsername } from './systems/daily';
import { earnedTitles, markTitlesSeen } from './systems/titles';
import { State } from './constants';

// Wire global error handlers as early as possible so a bug during the rest of
// boot still gets reported.
installErrorHandlers();
emit('boot.start');

const hydrationStart = performance.now();
Storage.load();
emit('save.hydrate', {
  ms: Math.round(performance.now() - hydrationStart),
  hasProgress: (Storage.data.unlockedLevel || 0) > 0,
  dailyStreak: Storage.data.dailyStreak || 0,
  schemaVersion: Storage.data.schemaVersion,
});
AudioSys.muted = !!Storage.data.muted;

// One-time backfill: for an existing player whose save predates the
// title-unlock-toast feature, treat all currently-earned titles as already
// seen so they don't get a wall of toasts on the next ball pop. Detection:
// they have meaningful progress but no seenTitleIds set yet.
if (!Storage.data.seenTitleIds && (Storage.data.unlockedLevel || 0) > 0) {
  markTitlesSeen(earnedTitles().map(t => t.id));
}

// Register the ad lifecycle hook so the game pauses + ducks audio while an ad
// is on screen, then resumes cleanly. The hook is called for BOTH success and
// error paths — failing to resume on error is one of the top CrazyGames
// rejection reasons.
let preAdState: ReturnType<() => typeof game.state> | null = null;
Platform.setAdLifecycleHook((event) => {
  if (event === 'start') {
    AudioSys.duckForAd();
    // If the game happens to still be in PLAYING (rare — ads run from
    // game-over / level-clear which are non-PLAYING states), snapshot the
    // state and pause so the player doesn't take damage while the ad runs.
    if (game.state === State.PLAYING) {
      preAdState = game.state;
      game.state = State.PAUSED;
    }
  } else {
    AudioSys.unduckForAd();
    if (preAdState != null && game.state === State.PAUSED) {
      game.state = preAdState;
    }
    preAdState = null;
  }
});

// Kick off platform/SDK init in the background. The CrazyGames SDK throws
// from its module getters if accessed before init() resolves, so every
// gameplay/loading event below is fire-and-forget — Platform.* methods all
// silently no-op until `Platform.ready` flips to true.
emit('sdk.init.start');
Platform.init().then(() => {
  emit('sdk.init.done', { hasSDK: Platform.hasSDK, adsBlocked: Platform.adsBlocked });
  // Now that the SDK is actually ready, signal the load phase. We're already
  // past asset decoding (Vite handled it), so loadingStart/Stop bracket the
  // remaining boot work that's hopefully sub-frame.
  Platform.loadingStart();
  Platform.loadingStop();
  // Best-effort: pull the player's CrazyGames username so the welcome-back
  // banner can address them by name. No-op for guests / offline / no SDK.
  Platform.getUsername().then(name => { if (name) setUsername(name); });
  // Pull any cloud save AFTER SDK init resolves, then merge into the local
  // copy. Best-effort: if the player is a guest or offline this is a no-op.
  return Storage.hydrateCloud().then(result => {
    if (result.merged) {
      emit('save.cloud_merged');
      // Re-apply settings that may have been overwritten by the cloud copy.
      AudioSys.muted = !!Storage.data.muted;
      // Keep the resume level in sync with any cross-device progress.
      game.unlockedLevel = Storage.data.unlockedLevel || 0;
    }
  });
}).catch(err => {
  emit('sdk.init.error', { message: String(err) });
});

const game = new Game();
game.unlockedLevel = Storage.data.unlockedLevel || 0;
bindCanvasInput(game.canvas);

// First-ever visit: skip the menu and drop the player straight into Level 1.
const isFirstVisit = !Storage.data.unlockedLevel
  && Object.keys(Storage.data.bestTour || {}).length === 0
  && !Storage.data.bestScoreAttack
  && !Storage.data.bestPanicWave;

emit('boot.ready', { firstVisit: isFirstVisit });

if (isFirstVisit) {
  game.startTour(0);
}

// Snapshot any welcome-back greeting against the previous lastSessionDate,
// then update lastSessionDate to today. The main menu reads the cached
// snapshot, so the banner stays stable for the session.
captureWelcomeBack();

// Auto-pause when the tab is hidden so a tab-out during a level can't kill
// the player while they're not looking. Resumes only when the player chooses
// — we never auto-resume because they may be looking at another tab.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.state === State.PLAYING) {
      game.state = State.PAUSED;
    }
  });
}

game.start();
