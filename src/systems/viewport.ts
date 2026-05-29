/**
 * Keeps CSS viewport units tied to the actually visible browser viewport.
 * Mobile Safari can report `100vh`/`100dvh` larger than the playable area while
 * its chrome is visible, which makes the fixed 16:9 stage overflow and get cut
 * off. `visualViewport` is the reliable source on iPhone; fall back to the
 * layout viewport elsewhere.
 */
const noopCleanup = () => {};
let uninstallViewportSizing: (() => void) | null = null;

export function installViewportSizing() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return noopCleanup;
  if (uninstallViewportSizing) return uninstallViewportSizing;

  let pendingAnimationFrameId: number | null = null;
  const root = document.documentElement;
  const visualViewport = window.visualViewport;

  const readViewport = () => {
    const visual = window.visualViewport;
    const width = visual?.width || window.innerWidth || root.clientWidth;
    const height = visual?.height || window.innerHeight || root.clientHeight;
    return {
      width: Math.max(1, width),
      height: Math.max(1, height),
    };
  };

  const apply = () => {
    pendingAnimationFrameId = null;
    const { width, height } = readViewport();
    root.style.setProperty('--app-vw', `${width}px`);
    root.style.setProperty('--app-vh', `${height}px`);
  };

  const schedule = () => {
    if (pendingAnimationFrameId !== null) return;
    pendingAnimationFrameId = window.requestAnimationFrame(apply);
  };

  apply();
  window.addEventListener('resize', schedule, { passive: true });
  window.addEventListener('orientationchange', schedule, { passive: true });
  window.addEventListener('pageshow', schedule, { passive: true });
  visualViewport?.addEventListener('resize', schedule, { passive: true });
  visualViewport?.addEventListener('scroll', schedule, { passive: true });

  uninstallViewportSizing = () => {
    if (pendingAnimationFrameId !== null) {
      window.cancelAnimationFrame(pendingAnimationFrameId);
      pendingAnimationFrameId = null;
    }
    window.removeEventListener('resize', schedule);
    window.removeEventListener('orientationchange', schedule);
    window.removeEventListener('pageshow', schedule);
    visualViewport?.removeEventListener('resize', schedule);
    visualViewport?.removeEventListener('scroll', schedule);
    uninstallViewportSizing = null;
  };

  return uninstallViewportSizing;
}
