import { CEILING_Y, GROUND_Y, H, THEMES, W, WALL_L, WALL_R, type ThemeName } from '../constants';

// ============================ RENDER HELPERS ========================
export function roundRect(ctx, x, y, w, h, r, fill, stroke) {
  if (r > Math.min(w, h) / 2) r = Math.min(w, h) / 2;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}

/** Ambient atmosphere layer — drifting flecks per world. Procedural and
 *  allocation-free: particle positions are derived from `i` and `t`, so
 *  there's no array to manage or GC pressure. Drawn after the silhouettes
 *  but before the floor so they sit "in front of" the parallax. */
function drawAmbience(ctx: CanvasRenderingContext2D, theme: ThemeName, t: number) {
  if (theme === 'arctic') {
    // Drifting snowflakes
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    for (let i = 0; i < 32; i++) {
      const seedX = (i * 113) % W;
      const wobble = Math.sin(t * 0.6 + i * 1.3) * 18;
      const x = (seedX + wobble + W) % W;
      const y = ((t * (18 + (i % 5) * 3) + i * 47) % (GROUND_Y - CEILING_Y)) + CEILING_Y;
      const r = 1 + (i % 3) * 0.6;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
  } else if (theme === 'volcano') {
    // Rising embers — orange dots that drift upward and fade
    for (let i = 0; i < 24; i++) {
      const px = (i * 167 + Math.sin(t * 1.2 + i) * 22) % W;
      const rise = (t * (50 + (i % 4) * 10) + i * 73) % (GROUND_Y - CEILING_Y);
      const y = GROUND_Y - 6 - rise;
      const life = 1 - rise / (GROUND_Y - CEILING_Y);
      ctx.fillStyle = `rgba(255,${100 + Math.floor(life * 90)},0,${(life * 0.7).toFixed(3)})`;
      ctx.beginPath(); ctx.arc(px, y, 1.6 + life * 1.4, 0, Math.PI * 2); ctx.fill();
    }
  } else if (theme === 'desert') {
    // Dust motes drifting right
    for (let i = 0; i < 28; i++) {
      const px = (i * 89 + t * (12 + (i % 4) * 4)) % W;
      const py = CEILING_Y + 30 + ((i * 53) % (GROUND_Y - CEILING_Y - 60));
      const wob = Math.sin(t * 0.8 + i) * 6;
      ctx.fillStyle = `rgba(255,220,150,${0.18 + (i % 3) * 0.06})`;
      ctx.beginPath(); ctx.arc(px, py + wob, 1.5 + (i % 2), 0, Math.PI * 2); ctx.fill();
    }
  } else if (theme === 'city') {
    // Slow neon flecks rising
    for (let i = 0; i < 20; i++) {
      const px = (i * 137) % W;
      const rise = (t * (30 + (i % 3) * 8) + i * 91) % (GROUND_Y - CEILING_Y - 40);
      const y = GROUND_Y - 20 - rise;
      const hue = (i * 47) % 360;
      ctx.fillStyle = `hsla(${hue}, 90%, 65%, 0.35)`;
      ctx.beginPath(); ctx.arc(px, y, 1.2 + (i % 2) * 0.8, 0, Math.PI * 2); ctx.fill();
    }
  } else if (theme === 'beach') {
    // Sparkling water reflections on the sea band
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    for (let i = 0; i < 14; i++) {
      const px = (i * 73 + (t * 25) % 73) % W;
      const py = GROUND_Y - 75 + Math.sin(t * 2 + i) * 3;
      const flicker = 0.4 + Math.abs(Math.sin(t * 4 + i)) * 0.6;
      ctx.globalAlpha = flicker * 0.7;
      ctx.beginPath(); ctx.arc(px, py, 1.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  } else if (theme === 'airship') {
    // Wind streaks — short thin diagonal dashes drifting left
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 22; i++) {
      const x = (i * 71 + W - (t * 60) % W) % W;
      const y = CEILING_Y + 20 + ((i * 41) % (GROUND_Y - CEILING_Y - 40));
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 10, y + 2);
      ctx.stroke();
    }
  } else if (theme === 'boss') {
    // Cosmic twinkles + slow drift toward center
    for (let i = 0; i < 40; i++) {
      const baseX = (i * 53) % W;
      const baseY = CEILING_Y + ((i * 71) % (GROUND_Y - CEILING_Y));
      const pull = Math.sin(t * 0.4 + i) * 6;
      const flicker = 0.3 + Math.abs(Math.sin(t * 2 + i * 0.7)) * 0.7;
      ctx.fillStyle = `rgba(255,255,255,${flicker * 0.55})`;
      ctx.beginPath(); ctx.arc(baseX + pull, baseY, 1 + (i % 2) * 0.5, 0, Math.PI * 2); ctx.fill();
    }
  }
}

// =====================================================================
// PARALLAX FAR / MID / NEAR LAYERS
//
// drawBackground composes the scene front-to-back: sky → far layer →
// mid layer → near layer → ambience → floor → walls → ceiling. Each
// helper is procedural (no asset loading), allocation-light, and
// stays inside the play frame's safe zones so it never obscures
// gameplay. Silhouettes are intentionally desaturated/darker than the
// gameplay layer so the balls / player always pop on top.
// =====================================================================

/** 3-stop sky with a subtle horizon glow. Replaces the prior 2-stop linear
 *  gradient. We bias the middle stop low (0.55) so the lower 40% of sky
 *  carries the warmer / atmospheric horizon hue — this is what makes the
 *  scene read as "depth" instead of "flat gradient." */
function drawSky(ctx: CanvasRenderingContext2D, theme: ThemeName) {
  const T = THEMES[theme];
  // Middle stop is a desaturated mix between sky1 and sky2; we approximate
  // it by sampling 60/40 on the spot. Keeping it as a hardcoded color
  // avoids per-frame color-mixing overhead.
  let mid: string;
  switch (theme) {
    case 'beach':   mid = '#a9e3ec'; break;
    case 'desert':  mid = '#ffb27a'; break;
    case 'arctic':  mid = '#1c3559'; break;
    case 'city':    mid = '#2b3a59'; break;
    case 'volcano': mid = '#7a1e26'; break;
    case 'airship': mid = '#5b8eb6'; break;
    case 'boss':    mid = '#1f0533'; break;
    default:        mid = T.sky2;    break;
  }
  const g = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
  g.addColorStop(0,    T.sky1);
  g.addColorStop(0.55, mid);
  g.addColorStop(1,    T.sky2);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, GROUND_Y);

  // Horizon haze band — soft glow above the floor that sells "atmosphere."
  // Color is theme-tinted, very low alpha, drawn as a vertical gradient.
  let hazeColor: string;
  switch (theme) {
    case 'beach':   hazeColor = '255,224,179'; break;  // warm sand
    case 'desert':  hazeColor = '255,140,80';  break;  // dust haze
    case 'arctic':  hazeColor = '155,231,255'; break;  // cool moonlight
    case 'city':    hazeColor = '255,150,80';  break;  // sodium-vapor glow
    case 'volcano': hazeColor = '255,80,0';    break;  // lava heat
    case 'airship': hazeColor = '244,211,94';  break;  // golden hour
    case 'boss':    hazeColor = '255,43,136';  break;  // boss pink
    default:        hazeColor = '255,255,255'; break;
  }
  const hg = ctx.createLinearGradient(0, GROUND_Y - 180, 0, GROUND_Y);
  hg.addColorStop(0, `rgba(${hazeColor},0)`);
  hg.addColorStop(1, `rgba(${hazeColor},0.32)`);
  ctx.fillStyle = hg;
  ctx.fillRect(0, GROUND_Y - 180, W, 180);
}

/** Sun / moon / large celestial body, plus glow halo. */
function drawCelestial(ctx: CanvasRenderingContext2D, theme: ThemeName, t: number) {
  let cx = 0, cy = 0, r = 0, core = '', halo = '';
  switch (theme) {
    case 'beach':   cx = 770; cy = 110; r = 38; core = '#fff5b1'; halo = '255,245,177'; break;
    case 'desert':  cx = 200; cy = 130; r = 50; core = '#ff8030'; halo = '255,128,48';  break;
    case 'arctic':  cx = 750; cy = 110; r = 32; core = '#e8f4ff'; halo = '155,231,255'; break;
    case 'city':    cx = 810; cy = 115; r = 24; core = '#ffe066'; halo = '255,224,102'; break;
    case 'volcano': cx = 740; cy = 120; r = 34 + Math.sin(t * 4) * 3; core = '#ffb703'; halo = '255,140,0'; break;
    case 'airship': cx = 800; cy = 100; r = 30; core = '#fff2a8'; halo = '255,224,140'; break;
    case 'boss':    return; // boss skips the celestial; it has nebula rings instead
    default: return;
  }
  // Outer halo — large soft radial.
  const g = ctx.createRadialGradient(cx, cy, r * 0.4, cx, cy, r * 3.5);
  g.addColorStop(0,    `rgba(${halo},0.55)`);
  g.addColorStop(0.5,  `rgba(${halo},0.18)`);
  g.addColorStop(1,    `rgba(${halo},0)`);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(cx, cy, r * 3.5, 0, Math.PI * 2); ctx.fill();
  // Body
  ctx.fillStyle = core;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  // Inner bright core
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.beginPath(); ctx.arc(cx - r * 0.2, cy - r * 0.25, r * 0.55, 0, Math.PI * 2); ctx.fill();
}

/** Per-biome FAR layer — most distant silhouettes, washed-out, low contrast.
 *  Sits just above the horizon haze so the haze fog-mixes into it. */
function drawFarLayer(ctx: CanvasRenderingContext2D, theme: ThemeName, t: number) {
  if (theme === 'beach') {
    // Two distant tropical islands — proper curved silhouettes with palm tree
    // silhouettes on the crown so the shape reads instantly as "island," not
    // "mystery blob." Far-distance haze tint keeps them recessed.
    const islands: { cx: number; w: number; h: number; palms: number[] }[] = [
      { cx: 230, w: 180, h: 48, palms: [-30, 0, 28] },
      { cx: 720, w: 220, h: 58, palms: [-40, -10, 22, 50] },
    ];
    for (const isl of islands) {
      const baseY = GROUND_Y - 92;
      // Island body — asymmetric hill curve, suggestion of a volcanic peak.
      ctx.fillStyle = 'rgba(45,95,115,0.72)';
      ctx.beginPath();
      ctx.moveTo(isl.cx - isl.w / 2, baseY);
      ctx.bezierCurveTo(
        isl.cx - isl.w * 0.3, baseY - isl.h * 0.4,
        isl.cx - isl.w * 0.15, baseY - isl.h,
        isl.cx, baseY - isl.h * 0.95,
      );
      ctx.bezierCurveTo(
        isl.cx + isl.w * 0.2, baseY - isl.h * 0.9,
        isl.cx + isl.w * 0.35, baseY - isl.h * 0.5,
        isl.cx + isl.w / 2, baseY,
      );
      ctx.closePath();
      ctx.fill();
      // Subtle lighter highlight along the sun-facing slope (top-right).
      ctx.fillStyle = 'rgba(120,180,200,0.35)';
      ctx.beginPath();
      ctx.moveTo(isl.cx, baseY - isl.h * 0.95);
      ctx.bezierCurveTo(
        isl.cx + isl.w * 0.2, baseY - isl.h * 0.9,
        isl.cx + isl.w * 0.35, baseY - isl.h * 0.5,
        isl.cx + isl.w / 2, baseY,
      );
      ctx.lineTo(isl.cx + isl.w * 0.1, baseY - isl.h * 0.4);
      ctx.closePath();
      ctx.fill();
      // Palm silhouettes on the island crown — tiny dark trunks + bushy tops.
      ctx.fillStyle = 'rgba(20,40,50,0.85)';
      for (const dx of isl.palms) {
        const palmX = isl.cx + dx;
        // Estimate palm-base Y by walking along the island top curve.
        // Approximation: highest at center, sloping down toward edges.
        const t = Math.abs(dx) / (isl.w / 2);
        const palmBaseY = baseY - isl.h * (1 - t * t * 0.6);
        // Trunk
        ctx.fillRect(palmX - 1, palmBaseY - 10, 2, 10);
        // Frond cluster — small bushy ellipse.
        ctx.beginPath();
        ctx.ellipse(palmX, palmBaseY - 12, 7, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(palmX - 4, palmBaseY - 10, 4, 2.5, 0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(palmX + 4, palmBaseY - 10, 4, 2.5, -0.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // A few seabirds in the distance — small silhouettes that add life.
    ctx.strokeStyle = 'rgba(40,60,80,0.65)';
    ctx.lineWidth = 1.2;
    const birds: [number, number][] = [[150, 130], [400, 110], [430, 120], [620, 145]];
    for (const [bx, by] of birds) {
      ctx.beginPath();
      ctx.moveTo(bx - 5, by);
      ctx.quadraticCurveTo(bx - 2, by - 3, bx, by);
      ctx.quadraticCurveTo(bx + 2, by - 3, bx + 5, by);
      ctx.stroke();
    }
  } else if (theme === 'desert') {
    // Far mesas — flat-topped silhouettes.
    ctx.fillStyle = 'rgba(150,80,40,0.55)';
    const mesas = [120, 280, 470, 660, 820];
    for (let i = 0; i < mesas.length; i++) {
      const mx = mesas[i];
      const mh = 80 + (i % 3) * 22;
      ctx.beginPath();
      ctx.moveTo(mx - 50, GROUND_Y - 30);
      ctx.lineTo(mx - 50, GROUND_Y - 30 - mh + 10);
      ctx.lineTo(mx - 40, GROUND_Y - 30 - mh);
      ctx.lineTo(mx + 40, GROUND_Y - 30 - mh);
      ctx.lineTo(mx + 50, GROUND_Y - 30 - mh + 10);
      ctx.lineTo(mx + 50, GROUND_Y - 30);
      ctx.closePath();
      ctx.fill();
    }
  } else if (theme === 'arctic') {
    // Aurora curtain — wide soft horizontal gradient near the top of the sky.
    const ag = ctx.createLinearGradient(0, 70, 0, 200);
    ag.addColorStop(0,   'rgba(155,231,255,0)');
    ag.addColorStop(0.4, `rgba(120,255,180,${0.18 + Math.sin(t * 0.7) * 0.06})`);
    ag.addColorStop(0.7, `rgba(155,120,255,${0.18 + Math.sin(t * 0.5 + 1) * 0.06})`);
    ag.addColorStop(1,   'rgba(155,231,255,0)');
    ctx.fillStyle = ag;
    ctx.fillRect(0, 70, W, 140);
    // Far mountains — desaturated blue, gentle peaks.
    ctx.fillStyle = 'rgba(70,100,140,0.6)';
    ctx.beginPath();
    ctx.moveTo(-10, GROUND_Y - 30);
    for (let x = -10; x <= W + 10; x += 30) {
      const h = 70 + Math.sin(x * 0.012) * 30 + Math.sin(x * 0.04 + 1) * 18;
      ctx.lineTo(x, GROUND_Y - 30 - h);
    }
    ctx.lineTo(W + 10, GROUND_Y - 30);
    ctx.closePath();
    ctx.fill();
  } else if (theme === 'city') {
    // Distant skyline — small uniform buildings, very dim.
    ctx.fillStyle = 'rgba(40,55,80,0.65)';
    for (let i = 0; i < 16; i++) {
      const bw = 38 + (i % 3) * 14;
      const bh = 50 + ((i * 53) % 60);
      const bx = i * 62 - 12;
      ctx.fillRect(bx, GROUND_Y - 60 - bh, bw, bh);
    }
    // Far window lights — sparse dim dots.
    ctx.fillStyle = 'rgba(255,224,140,0.35)';
    for (let i = 0; i < 24; i++) {
      const bx = (i * 67) % W;
      const by = GROUND_Y - 70 - ((i * 31) % 80);
      ctx.fillRect(bx, by, 2, 2);
    }
  } else if (theme === 'volcano') {
    // Far volcanic ridge — silhouette with rising ash plume.
    ctx.fillStyle = 'rgba(50,16,18,0.7)';
    ctx.beginPath();
    ctx.moveTo(0, GROUND_Y - 30);
    ctx.lineTo(180, GROUND_Y - 130);
    ctx.lineTo(360, GROUND_Y - 80);
    ctx.lineTo(540, GROUND_Y - 160);
    ctx.lineTo(720, GROUND_Y - 100);
    ctx.lineTo(W, GROUND_Y - 130);
    ctx.lineTo(W, GROUND_Y - 30);
    ctx.closePath();
    ctx.fill();
    // Ash plume rising from the main peak (the volcano drawn in mid-layer).
    const plumeBase = 260;
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = `rgba(70,40,40,${0.25 - i * 0.04})`;
      ctx.beginPath();
      ctx.ellipse(plumeBase + Math.sin(t * 0.3 + i) * 12, 200 - i * 38, 60 + i * 18, 30 + i * 10, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (theme === 'airship') {
    // Layered cloud puffs at far distance.
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    for (let i = 0; i < 8; i++) {
      const cx = (i * 160 + (t * 12) % 160) - 40;
      const cy = 110 + (i % 3) * 30;
      ctx.beginPath();
      ctx.ellipse(cx - 18, cy, 22, 12, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + 8,  cy - 6, 28, 14, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + 28, cy, 20, 10, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // Far airship silhouette drifting across.
    const ax = (W - (t * 22) % (W + 200)) - 100;
    ctx.fillStyle = 'rgba(110,90,70,0.5)';
    ctx.beginPath();
    ctx.ellipse(ax, 140, 60, 16, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (theme === 'boss') {
    // Cosmic nebula rings — pulsing concentric rings, very low alpha.
    for (let i = 0; i < 5; i++) {
      const r = (t * 50 + i * 90) % 440;
      ctx.strokeStyle = `rgba(255,43,136,${(0.45 - r / 900).toFixed(3)})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(W / 2, 220, r, 0, Math.PI * 2); ctx.stroke();
    }
    // Distant stars — small uniform dots.
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    for (let i = 0; i < 60; i++) {
      const sx = (i * 79 + 11) % W;
      const sy = (i * 41) % (GROUND_Y - 80);
      const tw = 0.4 + Math.abs(Math.sin(t * 1.5 + i)) * 0.6;
      ctx.globalAlpha = tw * 0.55;
      ctx.fillRect(sx, sy, 2, 2);
    }
    ctx.globalAlpha = 1;
  }
}

/** Per-biome MID layer — closer, sharper, more saturated silhouettes. */
function drawMidLayer(ctx: CanvasRenderingContext2D, theme: ThemeName, t: number) {
  if (theme === 'beach') {
    // Sea band — multi-layer tropical water. A vertical gradient deepens
    // toward the horizon (dark) and brightens toward shore (turquoise), with
    // three parallax wave layers drawn as smooth sine curves.
    const seaTop = GROUND_Y - 95;
    const seaH   = 35;
    const seaBottom = seaTop + seaH;
    // Base gradient — deep teal at horizon, turquoise at shore.
    const sg = ctx.createLinearGradient(0, seaTop, 0, seaBottom);
    sg.addColorStop(0,    '#1d4d8a');
    sg.addColorStop(0.5,  '#2a7ab8');
    sg.addColorStop(1,    '#4ab4d8');
    ctx.fillStyle = sg;
    ctx.fillRect(0, seaTop, W, seaH);
    // Sun reflection — bright glimmer column under the sun (which is at x=770).
    const reflGrad = ctx.createLinearGradient(0, seaTop, 0, seaBottom);
    reflGrad.addColorStop(0, 'rgba(255,245,177,0.0)');
    reflGrad.addColorStop(0.5, 'rgba(255,245,177,0.35)');
    reflGrad.addColorStop(1, 'rgba(255,245,177,0.0)');
    ctx.fillStyle = reflGrad;
    ctx.beginPath();
    ctx.moveTo(770, seaTop);
    ctx.lineTo(770 - 50, seaBottom);
    ctx.lineTo(770 + 50, seaBottom);
    ctx.closePath();
    ctx.fill();
    // Wave layer 1 (back) — long lazy sine, low alpha. Drifts slow.
    ctx.strokeStyle = 'rgba(255,255,255,0.32)';
    ctx.lineWidth = 1.5;
    for (let layer = 0; layer < 3; layer++) {
      const wy = seaTop + 8 + layer * 9;
      const amp = 2.2 - layer * 0.4;
      const freq = 0.018 + layer * 0.005;
      const drift = t * (8 + layer * 5);
      const alpha = 0.4 - layer * 0.1;
      ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
      ctx.lineWidth = 1.4 - layer * 0.3;
      ctx.beginPath();
      for (let x = 0; x <= W; x += 6) {
        const y = wy + Math.sin(x * freq + drift * 0.1) * amp;
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    // Wave crests — short bright dashes drifting in time. Spaced and varied
    // so they read as foam caps rather than uniform stripes.
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    for (let i = 0; i < 18; i++) {
      const wx = (i * 56 + (t * 12) % 56) % W;
      const layer = i % 3;
      const wy = seaTop + 12 + layer * 7;
      const len = 8 + (i % 4) * 3;
      ctx.beginPath();
      ctx.moveTo(wx, wy);
      ctx.quadraticCurveTo(wx + len / 2, wy - 1.5, wx + len, wy);
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
    // Foam line — soft white band where the sea meets the sand, with a wavy
    // top edge drawn as a single filled shape (not pixel fragments).
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.moveTo(0, seaBottom);
    for (let x = 0; x <= W; x += 8) {
      const y = seaBottom + Math.sin(x * 0.06 + t * 1.2) * 1.5 + Math.sin(x * 0.13 + t * 0.6) * 0.8;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, seaBottom + 4);
    ctx.lineTo(0, seaBottom + 4);
    ctx.closePath();
    ctx.fill();
    // Wet-sand line — slightly darker sand-tone band just below the foam,
    // making the shore transition feel realistic.
    ctx.fillStyle = 'rgba(180,135,80,0.55)';
    ctx.fillRect(0, seaBottom + 4, W, 4);
  } else if (theme === 'desert') {
    // Mid dunes — two layered curves with different shades.
    ctx.fillStyle = 'rgba(180,110,55,0.75)';
    ctx.beginPath();
    ctx.moveTo(0, GROUND_Y - 30);
    for (let x = 0; x <= W; x += 18) {
      ctx.lineTo(x, GROUND_Y - 30 - 30 - Math.sin(x * 0.008) * 22 - Math.sin(x * 0.02 + 1.5) * 8);
    }
    ctx.lineTo(W, GROUND_Y); ctx.lineTo(0, GROUND_Y); ctx.closePath(); ctx.fill();
    // Distant cacti silhouettes.
    ctx.fillStyle = 'rgba(70,50,30,0.7)';
    const cacti = [180, 400, 620, 820];
    for (let i = 0; i < cacti.length; i++) {
      const cx = cacti[i];
      ctx.fillRect(cx - 3, GROUND_Y - 75, 6, 45);
      ctx.fillRect(cx - 12, GROUND_Y - 64, 6, 14);
      ctx.fillRect(cx + 6,  GROUND_Y - 60, 6, 18);
    }
  } else if (theme === 'arctic') {
    // Mid mountains — sharper peaks, darker.
    ctx.fillStyle = '#3a5a7c';
    for (let i = 0; i < 6; i++) {
      const mx = i * 180 + 60;
      ctx.beginPath();
      ctx.moveTo(mx, GROUND_Y - 30);
      ctx.lineTo(mx + 100, GROUND_Y - 150);
      ctx.lineTo(mx + 200, GROUND_Y - 30);
      ctx.closePath(); ctx.fill();
    }
    // Snow caps with shading.
    ctx.fillStyle = '#fff';
    for (let i = 0; i < 6; i++) {
      const mx = i * 180 + 60;
      ctx.beginPath();
      ctx.moveTo(mx + 70, GROUND_Y - 105);
      ctx.lineTo(mx + 100, GROUND_Y - 150);
      ctx.lineTo(mx + 130, GROUND_Y - 105);
      ctx.closePath(); ctx.fill();
    }
    // Snow shadow on the right face of each peak.
    ctx.fillStyle = 'rgba(150,180,210,0.55)';
    for (let i = 0; i < 6; i++) {
      const mx = i * 180 + 60;
      ctx.beginPath();
      ctx.moveTo(mx + 100, GROUND_Y - 150);
      ctx.lineTo(mx + 130, GROUND_Y - 105);
      ctx.lineTo(mx + 200, GROUND_Y - 30);
      ctx.closePath(); ctx.fill();
    }
    // Pine tree silhouettes scattered at the base.
    ctx.fillStyle = '#1a2b3a';
    const pines = [80, 170, 280, 390, 520, 640, 760, 880];
    for (let i = 0; i < pines.length; i++) {
      const px = pines[i];
      ctx.fillRect(px - 1, GROUND_Y - 38, 3, 14);
      ctx.beginPath();
      ctx.moveTo(px - 9, GROUND_Y - 32);
      ctx.lineTo(px,     GROUND_Y - 56);
      ctx.lineTo(px + 9, GROUND_Y - 32);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(px - 7, GROUND_Y - 40);
      ctx.lineTo(px,     GROUND_Y - 60);
      ctx.lineTo(px + 7, GROUND_Y - 40);
      ctx.closePath(); ctx.fill();
    }
  } else if (theme === 'city') {
    // Main skyline — bigger buildings with proper window grid.
    for (let i = 0; i < 12; i++) {
      const bw = 60 + (i % 3) * 20;
      const bh = 100 + ((i * 41) % 120);
      const bx = i * 84 - 16;
      const by = GROUND_Y - bh;
      // Body with subtle gradient.
      const bg = ctx.createLinearGradient(bx, by, bx + bw, by);
      bg.addColorStop(0, '#181f2e');
      bg.addColorStop(1, '#2a3245');
      ctx.fillStyle = bg;
      ctx.fillRect(bx, by, bw, bh);
      // Window grid — alternating lit/unlit pattern, time-based blink on a few.
      const winCols = Math.floor(bw / 12);
      const winRows = Math.floor((bh - 20) / 16);
      for (let r = 0; r < winRows; r++) {
        for (let c = 0; c < winCols; c++) {
          const seed = (i * 17 + r * 7 + c * 3);
          const lit = (seed % 3) !== 0;
          if (!lit) continue;
          const blink = ((seed % 11) === 0) ? (Math.sin(t * 2 + seed) > 0.6 ? 1 : 0.3) : 1;
          ctx.fillStyle = `rgba(255,224,109,${0.55 * blink})`;
          ctx.fillRect(bx + 4 + c * 12, by + 12 + r * 16, 6, 8);
        }
      }
      // Building top edge highlight.
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(bx, by, bw, 2);
    }
    // Neon haze above the skyline.
    const ng = ctx.createLinearGradient(0, GROUND_Y - 220, 0, GROUND_Y - 100);
    ng.addColorStop(0, 'rgba(255,77,109,0)');
    ng.addColorStop(1, 'rgba(255,77,109,0.18)');
    ctx.fillStyle = ng;
    ctx.fillRect(0, GROUND_Y - 220, W, 120);
  } else if (theme === 'volcano') {
    // Foreground volcano — bigger, with lava streams down the flanks.
    ctx.fillStyle = '#2b1110';
    ctx.beginPath();
    ctx.moveTo(40, GROUND_Y - 20);
    ctx.lineTo(260, GROUND_Y - 230);
    ctx.lineTo(470, GROUND_Y - 20);
    ctx.closePath(); ctx.fill();
    // Lava glow inside crater.
    const cg = ctx.createRadialGradient(260, GROUND_Y - 215, 6, 260, GROUND_Y - 215, 40);
    cg.addColorStop(0, '#ffd60a');
    cg.addColorStop(0.4, '#ff5400');
    cg.addColorStop(1, 'rgba(255,84,0,0)');
    ctx.fillStyle = cg;
    ctx.beginPath(); ctx.arc(260, GROUND_Y - 215, 38, 0, Math.PI * 2); ctx.fill();
    // Lava streams running down the flanks.
    ctx.strokeStyle = '#ff5400';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(255, GROUND_Y - 220);
    ctx.lineTo(220, GROUND_Y - 140);
    ctx.lineTo(180, GROUND_Y - 60);
    ctx.moveTo(265, GROUND_Y - 220);
    ctx.lineTo(305, GROUND_Y - 150);
    ctx.lineTo(340, GROUND_Y - 60);
    ctx.stroke();
    // Lava glow at the base of streams.
    ctx.fillStyle = 'rgba(255,84,0,0.55)';
    for (let i = 0; i < 5; i++) {
      const px = (i * 173 + 80) % W;
      ctx.fillRect(px, GROUND_Y - 26, 80, 6);
    }
  } else if (theme === 'airship') {
    // Main airship — central, larger, with rigging detail.
    const ax = W / 2;
    const ay = GROUND_Y - 120;
    // Balloon body
    const bg = ctx.createLinearGradient(0, ay - 52, 0, ay + 52);
    bg.addColorStop(0, '#8d7460');
    bg.addColorStop(1, '#4a3a2a');
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.ellipse(ax, ay, 260, 52, 0, 0, Math.PI * 2);
    ctx.fill();
    // Balloon top highlight.
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.beginPath();
    ctx.ellipse(ax - 20, ay - 30, 220, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    // Outline.
    ctx.strokeStyle = '#2f241a';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.ellipse(ax, ay, 260, 52, 0, 0, Math.PI * 2); ctx.stroke();
    // Rigging lines.
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 6; i++) {
      const rx = ax - 90 + i * 36;
      ctx.beginPath();
      ctx.moveTo(rx, ay + 38);
      ctx.lineTo(rx + (i - 2.5) * 2, ay + 56);
      ctx.stroke();
    }
    // Gondola.
    const gondGrad = ctx.createLinearGradient(0, ay + 32, 0, ay + 66);
    gondGrad.addColorStop(0, '#b8916c');
    gondGrad.addColorStop(1, '#7a5a40');
    ctx.fillStyle = gondGrad;
    roundRect(ctx, ax - 90, ay + 32, 180, 34, 6, true, false);
    ctx.strokeStyle = '#2f241a'; ctx.lineWidth = 2;
    roundRect(ctx, ax - 90, ay + 32, 180, 34, 6, false, true);
    // Windows on gondola.
    ctx.fillStyle = '#f4d35e';
    for (let i = 0; i < 5; i++) {
      ctx.fillRect(ax - 70 + i * 32, ay + 42, 14, 12);
    }
  } else if (theme === 'boss') {
    // Energy spirals — two counter-rotating arcs across the upper sky.
    for (let arm = 0; arm < 2; arm++) {
      const dir = arm === 0 ? 1 : -1;
      ctx.strokeStyle = arm === 0 ? 'rgba(255,43,136,0.35)' : 'rgba(155,123,255,0.32)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let a = 0; a < Math.PI; a += 0.1) {
        const radius = 60 + a * 50;
        const ang = a + t * 0.4 * dir;
        const px = W / 2 + Math.cos(ang) * radius;
        const py = 220 + Math.sin(ang) * radius * 0.4;
        if (a === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
  }
}

/** Per-biome NEAR layer — sharpest detail, closest to camera. Drawn AFTER
 *  ambience so it appears in front of drift particles. */
function drawNearLayer(ctx: CanvasRenderingContext2D, theme: ThemeName, _t: number) {
  if (theme === 'beach') {
    // Foreground palm trees — curved trunks, layered drooping fronds, coconuts.
    // Placement deliberately avoids the player spawn zone (x = 400..560) so
    // palms frame the scene rather than obscure the protagonist.
    const palms: { x: number; h: number; lean: number; mirror: boolean }[] = [
      { x: 70,  h: 96,  lean:  10, mirror: false },
      { x: 200, h: 78,  lean: -6,  mirror: true  },
      { x: 760, h: 82,  lean:  6,  mirror: false },
      { x: 890, h: 100, lean: -10, mirror: true  },
    ];
    for (const p of palms) {
      const baseY = GROUND_Y - 2;
      const top = baseY - p.h;
      const topX = p.x + p.lean;
      // Trunk — drawn as a tapering curved band (bezier) so it bows slightly,
      // like a real coconut palm leaning toward the sea breeze.
      ctx.save();
      ctx.fillStyle = '#3a2614';
      ctx.beginPath();
      ctx.moveTo(p.x - 7, baseY);
      ctx.quadraticCurveTo(p.x + p.lean * 0.4 - 5, (baseY + top) / 2, topX - 5, top);
      ctx.lineTo(topX + 5, top);
      ctx.quadraticCurveTo(p.x + p.lean * 0.4 + 5, (baseY + top) / 2, p.x + 7, baseY);
      ctx.closePath();
      ctx.fill();
      // Trunk highlight — narrow bright strip down the front, sells the curve.
      ctx.fillStyle = 'rgba(180,130,80,0.6)';
      ctx.beginPath();
      ctx.moveTo(p.x - 1, baseY);
      ctx.quadraticCurveTo(p.x + p.lean * 0.4 + 1, (baseY + top) / 2, topX + 1, top);
      ctx.lineTo(topX + 3, top);
      ctx.quadraticCurveTo(p.x + p.lean * 0.4 + 3, (baseY + top) / 2, p.x + 1, baseY);
      ctx.closePath();
      ctx.fill();
      // Trunk segment ridges — short dark arcs every ~14px down the trunk.
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      ctx.lineWidth = 1.2;
      const segs = Math.floor(p.h / 14);
      for (let s = 0; s < segs; s++) {
        const tt = (s + 1) / (segs + 1);
        const sy = baseY - p.h * tt;
        // X position interpolates along the bezier (linear approximation).
        const sx = p.x + p.lean * tt;
        ctx.beginPath();
        ctx.moveTo(sx - 6, sy);
        ctx.quadraticCurveTo(sx, sy + 2, sx + 6, sy);
        ctx.stroke();
      }
      ctx.restore();

      // Fronds — 8 drooping curves radiating from the crown, drawn as filled
      // tapered shapes (not single strokes) so each frond reads as a real leaf
      // with thickness. Mirroring varies frond direction per palm.
      const frondCount = 8;
      const mirror = p.mirror ? -1 : 1;
      for (let f = 0; f < frondCount; f++) {
        // Angle distributes fronds around the upper hemisphere, biased outward.
        const baseAngle = (f / (frondCount - 1)) * Math.PI - Math.PI / 2;
        const angle = baseAngle * mirror;
        const len = 36 + (f % 2) * 6;
        // Frond tip droops downward — gravity pulls leaf tips toward the ground.
        const tipX = topX + Math.cos(angle) * len;
        const tipY = top  + Math.sin(angle) * len * 0.6 + 14; // droop
        // Control point pulled "up and out" for an arching curve.
        const ctrlX = topX + Math.cos(angle) * len * 0.55;
        const ctrlY = top  + Math.sin(angle) * len * 0.4 - 6;
        // Frond body — filled tapered shape (stem ~5px wide, tapers to a point).
        const dxn = -Math.sin(angle) * 4;
        const dyn =  Math.cos(angle) * 4;
        // Dark base for depth.
        ctx.fillStyle = '#1f3a10';
        ctx.beginPath();
        ctx.moveTo(topX - dxn, top - dyn);
        ctx.quadraticCurveTo(ctrlX - dxn * 0.5, ctrlY - dyn * 0.5, tipX, tipY);
        ctx.quadraticCurveTo(ctrlX + dxn * 0.5, ctrlY + dyn * 0.5, topX + dxn, top + dyn);
        ctx.closePath();
        ctx.fill();
        // Brighter overlay (slightly inset) for highlight along the spine.
        ctx.fillStyle = '#4a7820';
        ctx.beginPath();
        ctx.moveTo(topX - dxn * 0.5, top - dyn * 0.5);
        ctx.quadraticCurveTo(ctrlX, ctrlY, tipX, tipY);
        ctx.quadraticCurveTo(ctrlX, ctrlY, topX + dxn * 0.5, top + dyn * 0.5);
        ctx.closePath();
        ctx.fill();
        // Leaflet ribs — short ticks along the frond spine for serrated read.
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.lineWidth = 0.8;
        for (let r = 1; r < 5; r++) {
          const rt = r / 5;
          const rx = topX + (tipX - topX) * rt;
          const ry = top  + (tipY - top)  * rt + Math.sin(rt * Math.PI) * 4;
          const perpX = -Math.sin(angle) * 3;
          const perpY =  Math.cos(angle) * 3;
          ctx.beginPath();
          ctx.moveTo(rx - perpX, ry - perpY);
          ctx.lineTo(rx + perpX, ry + perpY);
          ctx.stroke();
        }
      }
      // Coconut cluster — three coconuts nestled at the crown.
      const cocoColors = ['#3a2008', '#4a2a10', '#3a2008'];
      const cocoOffsets: [number, number][] = [[-5, 3], [0, 1], [5, 4]];
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = cocoColors[i];
        ctx.beginPath();
        ctx.arc(topX + cocoOffsets[i][0], top + cocoOffsets[i][1], 3.5, 0, Math.PI * 2);
        ctx.fill();
        // Tiny highlight on each coconut.
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.beginPath();
        ctx.arc(topX + cocoOffsets[i][0] - 1, top + cocoOffsets[i][1] - 1, 1, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Beach detail — scattered shells / pebbles along the shoreline foreground.
    const shells: [number, string][] = [
      [50, '#fff2d8'], [310, '#ffe0c0'], [410, '#fff2d8'],
      [620, '#ffd9a8'], [720, '#fff2d8'], [820, '#ffd9a8'],
    ];
    for (const [sx, color] of shells) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(sx, GROUND_Y + 14, 4, 2.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.beginPath();
      ctx.moveTo(sx - 4, GROUND_Y + 14);
      ctx.lineTo(sx + 4, GROUND_Y + 14);
      ctx.stroke();
    }
  } else if (theme === 'desert') {
    // Foreground cactus and a half-buried skull stone.
    ctx.fillStyle = '#3a5a2a';
    const cx = 740;
    // Saguaro body.
    roundRect(ctx, cx - 6, GROUND_Y - 75, 12, 75, 4, true, false);
    // Arms.
    roundRect(ctx, cx - 22, GROUND_Y - 50, 8, 30, 3, true, false);
    roundRect(ctx, cx - 22, GROUND_Y - 60, 16, 8, 3, true, false);
    roundRect(ctx, cx + 14, GROUND_Y - 65, 8, 38, 3, true, false);
    roundRect(ctx, cx + 6,  GROUND_Y - 70, 16, 8, 3, true, false);
    // Spine detail.
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(cx - 2, GROUND_Y - 65 + i * 16);
      ctx.lineTo(cx + 2, GROUND_Y - 65 + i * 16);
      ctx.stroke();
    }
  } else if (theme === 'arctic') {
    // Foreground ice shards — a few translucent crystal silhouettes.
    ctx.fillStyle = 'rgba(155,231,255,0.45)';
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1;
    const shards = [80, 220, 700, 860];
    for (let i = 0; i < shards.length; i++) {
      const sx = shards[i];
      ctx.beginPath();
      ctx.moveTo(sx,      GROUND_Y - 8);
      ctx.lineTo(sx - 14, GROUND_Y - 4);
      ctx.lineTo(sx - 6,  GROUND_Y - 36);
      ctx.lineTo(sx + 6,  GROUND_Y - 40);
      ctx.lineTo(sx + 14, GROUND_Y - 6);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
    }
  } else if (theme === 'city') {
    // Foreground signage / antenna silhouettes.
    ctx.fillStyle = '#0e1320';
    ctx.fillRect(120, GROUND_Y - 50, 4, 50);
    ctx.fillRect(118, GROUND_Y - 56, 8, 6);
    ctx.fillRect(820, GROUND_Y - 60, 4, 60);
    ctx.fillRect(818, GROUND_Y - 70, 8, 6);
    ctx.fillStyle = '#ff4d6d';
    ctx.fillRect(118, GROUND_Y - 56, 8, 6);
    ctx.fillStyle = '#9be7ff';
    ctx.fillRect(818, GROUND_Y - 70, 8, 6);
  } else if (theme === 'volcano') {
    // Foreground rocks / cinder cones.
    ctx.fillStyle = '#1a0808';
    ctx.beginPath();
    ctx.moveTo(60, GROUND_Y - 4);
    ctx.lineTo(90, GROUND_Y - 36);
    ctx.lineTo(140, GROUND_Y - 4);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(780, GROUND_Y - 4);
    ctx.lineTo(840, GROUND_Y - 50);
    ctx.lineTo(900, GROUND_Y - 4);
    ctx.closePath(); ctx.fill();
    // Tiny glow at tops.
    ctx.fillStyle = '#ff5400';
    ctx.beginPath(); ctx.arc(90, GROUND_Y - 36, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(840, GROUND_Y - 50, 3, 0, Math.PI * 2); ctx.fill();
  } else if (theme === 'airship') {
    // Foreground rigging ropes hanging from above — adds depth without
    // obstructing the play field.
    ctx.strokeStyle = 'rgba(60,40,20,0.55)';
    ctx.lineWidth = 1.5;
    const ropes = [60, 180, 800, 900];
    for (let i = 0; i < ropes.length; i++) {
      const rx = ropes[i];
      ctx.beginPath();
      ctx.moveTo(rx, CEILING_Y);
      ctx.lineTo(rx + (i % 2 === 0 ? 4 : -4), GROUND_Y - 4);
      ctx.stroke();
    }
  } else if (theme === 'boss') {
    // Glowing energy floor wisps — match the boss-pink accent.
    ctx.fillStyle = 'rgba(255,43,136,0.4)';
    for (let i = 0; i < 5; i++) {
      const wx = 80 + i * 180;
      ctx.beginPath();
      ctx.ellipse(wx, GROUND_Y - 6, 60, 4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// =====================================================================
// STAGE FRAME — floor, walls, ceiling. Drawn last so they always cap the
// scene. The frame is what makes the play area read as "a stage" instead
// of "an engine debug box." Each surface gets per-biome tinting via the
// THEMES palette, plus a depth-suggesting gradient + bevel highlight.
// =====================================================================

function drawFloor(ctx: CanvasRenderingContext2D, theme: ThemeName) {
  const T = THEMES[theme];
  // Main floor gradient.
  const fg = ctx.createLinearGradient(0, GROUND_Y, 0, H);
  fg.addColorStop(0,    T.g1);
  fg.addColorStop(0.5,  T.g2);
  fg.addColorStop(1,    T.g2);
  ctx.fillStyle = fg;
  ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);

  // Top edge highlight (catches light from the sky).
  const eg = ctx.createLinearGradient(0, GROUND_Y, 0, GROUND_Y + 6);
  eg.addColorStop(0, 'rgba(255,255,255,0.35)');
  eg.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = eg;
  ctx.fillRect(0, GROUND_Y, W, 6);

  // Dark contact-shadow line directly on the floor (where entities land).
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.fillRect(0, GROUND_Y, W, 2);

  // Biome-specific surface texture — subtle stripes / dots / tiles. Always
  // dim so they don't fight gameplay.
  ctx.save();
  ctx.globalAlpha = 0.18;
  if (theme === 'beach') {
    // Sand grain dots.
    ctx.fillStyle = '#7a5a30';
    for (let i = 0; i < 80; i++) {
      const sx = (i * 47 + 13) % W;
      const sy = GROUND_Y + 4 + ((i * 31) % (H - GROUND_Y - 6));
      ctx.fillRect(sx, sy, 2, 2);
    }
  } else if (theme === 'desert') {
    // Cracked-earth horizontal lines.
    ctx.strokeStyle = '#3a2010';
    ctx.lineWidth = 1;
    for (let i = 0; i < 12; i++) {
      const sy = GROUND_Y + 6 + (i * 4);
      const sx = (i * 73) % 60;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + 40 + (i % 3) * 18, sy);
      ctx.stroke();
    }
  } else if (theme === 'arctic') {
    // Ice cracks — short diagonals.
    ctx.strokeStyle = '#5a8eba';
    ctx.lineWidth = 1;
    for (let i = 0; i < 14; i++) {
      const sx = (i * 67 + 11) % W;
      const sy = GROUND_Y + 6 + ((i * 13) % (H - GROUND_Y - 10));
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + 14, sy + 4);
      ctx.stroke();
    }
  } else if (theme === 'city') {
    // Asphalt grid.
    ctx.strokeStyle = '#0a0e16';
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 80) {
      ctx.beginPath(); ctx.moveTo(x, GROUND_Y); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = GROUND_Y; y < H; y += 16) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
  } else if (theme === 'volcano') {
    // Cracked obsidian shards.
    ctx.strokeStyle = '#ff5400';
    ctx.lineWidth = 1;
    for (let i = 0; i < 18; i++) {
      const sx = (i * 53 + 7) % W;
      const sy = GROUND_Y + 4 + ((i * 11) % (H - GROUND_Y - 6));
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + 8, sy + 6);
      ctx.lineTo(sx + 18, sy);
      ctx.stroke();
    }
  } else if (theme === 'airship') {
    // Wood plank stripes.
    ctx.strokeStyle = '#3a2a18';
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 36) {
      ctx.beginPath(); ctx.moveTo(x, GROUND_Y + 2); ctx.lineTo(x, H); ctx.stroke();
    }
  } else if (theme === 'boss') {
    // Hex-grid faint glow.
    ctx.strokeStyle = '#ff2b88';
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 24) {
      ctx.beginPath(); ctx.moveTo(x, GROUND_Y + 8); ctx.lineTo(x + 12, GROUND_Y + 18); ctx.lineTo(x + 24, GROUND_Y + 8); ctx.stroke();
    }
  }
  ctx.restore();
}

function drawWalls(ctx: CanvasRenderingContext2D, theme: ThemeName) {
  const T = THEMES[theme];
  // Wall gradient: lighter at the inner edge (catching stage light), darker
  // toward the screen edge. Color is theme-derived so each biome reads as
  // its own stage frame.
  let wallColor: string;
  switch (theme) {
    case 'beach':   wallColor = '#3a2a16'; break;
    case 'desert':  wallColor = '#3a1e08'; break;
    case 'arctic':  wallColor = '#0b1a2e'; break;
    case 'city':    wallColor = '#0a0e18'; break;
    case 'volcano': wallColor = '#0a0202'; break;
    case 'airship': wallColor = '#1a1208'; break;
    case 'boss':    wallColor = '#0a0010'; break;
    default:        wallColor = '#1a1a22'; break;
  }
  // Left wall gradient (dark outer → softer inner).
  const lg = ctx.createLinearGradient(0, 0, WALL_L, 0);
  lg.addColorStop(0,    wallColor);
  lg.addColorStop(0.7,  wallColor);
  lg.addColorStop(1,    'rgba(0,0,0,0.5)');
  ctx.fillStyle = lg;
  ctx.fillRect(0, 0, WALL_L, GROUND_Y);
  // Right wall (mirrored).
  const rg = ctx.createLinearGradient(WALL_R, 0, W, 0);
  rg.addColorStop(0,    'rgba(0,0,0,0.5)');
  rg.addColorStop(0.3,  wallColor);
  rg.addColorStop(1,    wallColor);
  ctx.fillStyle = rg;
  ctx.fillRect(WALL_R, 0, W - WALL_R, GROUND_Y);
  // Inner edge accent — biome accent color, thin, sells "lit edge."
  ctx.fillStyle = T.acc;
  ctx.globalAlpha = 0.65;
  ctx.fillRect(WALL_L - 1, CEILING_Y, 1, GROUND_Y - CEILING_Y);
  ctx.fillRect(WALL_R,     CEILING_Y, 1, GROUND_Y - CEILING_Y);
  ctx.globalAlpha = 1;
}

function drawCeiling(ctx: CanvasRenderingContext2D, theme: ThemeName) {
  const T = THEMES[theme];
  // Ceiling band — dark base.
  let ceilColor: string;
  switch (theme) {
    case 'beach':   ceilColor = '#2a1e10'; break;
    case 'desert':  ceilColor = '#2a1408'; break;
    case 'arctic':  ceilColor = '#091422'; break;
    case 'city':    ceilColor = '#080c14'; break;
    case 'volcano': ceilColor = '#0a0202'; break;
    case 'airship': ceilColor = '#1a1208'; break;
    case 'boss':    ceilColor = '#0a0010'; break;
    default:        ceilColor = '#1a1a22'; break;
  }
  ctx.fillStyle = ceilColor;
  ctx.fillRect(0, 0, W, CEILING_Y);
  // Inner shadow — gives the ceiling a sense of depth, like it's a beam
  // overhead rather than a flat bar.
  const sg = ctx.createLinearGradient(0, CEILING_Y - 8, 0, CEILING_Y);
  sg.addColorStop(0, 'rgba(0,0,0,0)');
  sg.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = sg;
  ctx.fillRect(0, CEILING_Y - 8, W, 8);
  // Accent stripe along the bottom of the ceiling — uses the biome accent.
  // Rivets removed: they conflicted with the HTML HUD overlay (score/timer/
  // weapon chips sit in this band) and read as visual noise behind the panels.
  ctx.fillStyle = T.acc;
  ctx.fillRect(0, CEILING_Y - 4, W, 4);
}

// =====================================================================
// drawBackground — top-level scene composer. Called once per frame from
// renderWorld. Order is critical: every layer below must be drawn before
// the layer above, since canvas 2D has no z-buffer. Gameplay entities
// (balls / player / projectiles) are drawn by the caller AFTER this
// function returns, so they always sit in front of the stage.
// =====================================================================

export function drawBackground(ctx, theme, t) {
  drawSky(ctx, theme);
  drawCelestial(ctx, theme, t);
  drawFarLayer(ctx, theme, t);
  drawMidLayer(ctx, theme, t);
  drawAmbience(ctx, theme, t);
  drawNearLayer(ctx, theme, t);
  drawFloor(ctx, theme);
  drawWalls(ctx, theme);
  drawCeiling(ctx, theme);
}

/** Decorative bouncing ball for the menu background. */
export function drawDemoBall(ctx, x, y, r, colors) {
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(x, GROUND_Y + 2, r * 0.7, 4, 0, 0, Math.PI * 2); ctx.fill();
  const grad = ctx.createRadialGradient(x - r * 0.4, y - r * 0.4, r * 0.1, x, y, r);
  grad.addColorStop(0, '#fff');
  grad.addColorStop(0.25, colors[0]);
  grad.addColorStop(1, colors[1]);
  ctx.fillStyle = grad;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#1c0010'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  ctx.ellipse(x - r * 0.35, y - r * 0.4, r * 0.28, r * 0.18, -0.4, 0, Math.PI * 2);
  ctx.fill();
}
