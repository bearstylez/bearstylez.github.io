// The bearstyle factory: an isometric line-art loop drawn on a canvas. A little human drops out of
// the chute, rides the belt through the machine, comes out a bear and is lifted into the rocket.
// One cycle is T seconds and everything that moves is a function of the cycle phase, so the loop is
// exact. The clock starts at Stockholm time of day, which also gives the "bears launched today" count.
(() => {
  'use strict';

  const canvas = document.getElementById('factory');
  if (!canvas || !canvas.getContext) return;
  const main = canvas.getContext('2d');
  let ctx = main;                // swapped to the flight layer while the rocket leaves the page
  const countEl = document.getElementById('bear-count');
  const toggle = document.getElementById('factory-toggle');
  const pauseBtn = document.getElementById('factory-pause');
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const T = 7.2;                 // seconds per cycle: one human in, one bear out
  const TAU = Math.PI * 2, C = Math.cos(Math.PI / 6), S = 0.5;
  const ISO_RX = Math.SQRT2 * C, ISO_RY = Math.SQRT2 * S;   // a level circle of radius 1 on screen

  const INK = '#141517', BLUE = '#1f5fff', HALO = '#d6e2ff';
  const TOP = '#ffffff', LEFT = '#f6f6f7', RIGHT = '#eaebee', DEEP = '#dcdee2', SHADE = '#eceef1';
  const MUTE = '#c3c6cc', GLASS = '#eef1f6', CHEEK = '#dfe6fb';

  // Layout. x runs along the belt, y across it, z up.
  const BW = 46, ZB = 34;                     // belt width, belt surface height
  const XS = -46, XE = 430;                   // belt ends
  const XM = 256, MW = 56, MD = 40, MH = 120; // machine centre, half length, half depth, height
  const X0 = XM - MW, X1 = XM + MW;           // the machine's entry and exit faces
  const OPEN_W = 23, OPEN_H = 72;             // exit opening, half width and height
  const XL = 450, LS = 20, ZH = 122;          // lift centre, half size, top of travel
  const XR = 570, RR = 30;                    // rocket centre, radius
  const CS = 1.35;                            // character scale

  // Ages (in cycles since a character was born) for the moments of its trip. The belt speed D (travel
  // per cycle) is chosen so the bear is pushed into the rocket at age 3, i.e. exactly while the next
  // human drops out of the chute, and the next human lands before the previous one is out of sight.
  const A_LAND = 0.15, A_PUSH = 3, A_IN = 3.2, A_END = A_IN + 0.04;
  const A_STOP = A_PUSH - 0.22;               // settles on the lift, rises, then gets pushed
  const D = (XE + 2 * (XL - XE)) / (A_STOP - A_LAND);
  const SLAT = D / 10;
  const A_EASE = A_LAND + XE / D;

  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
  const ss = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
  const lerp = (a, b, t) => a + (b - a) * t;

  if (!ctx.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
      r = Math.min(r, w / 2, h / 2);
      this.moveTo(x + r, y); this.arcTo(x + w, y, x + w, y + h, r); this.arcTo(x + w, y + h, x, y + h, r);
      this.arcTo(x, y + h, x, y, r); this.arcTo(x, y, x + w, y, r); this.closePath();
    };
  }

  // ---------------------------------------------------------------------------------------------
  // Isometric drawing helpers
  // ---------------------------------------------------------------------------------------------
  const P = (x, y, z) => [(x - y) * C, (x + y) * S - z];
  let lw = 1;

  function trace(pts) {
    pts.forEach((p, i) => { const [sx, sy] = P(p[0], p[1], p[2]); i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy); });
    ctx.closePath();
  }
  function fillStroke(fill, stroke = true) {
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) ctx.stroke();
  }
  function quad(pts, fill) { ctx.beginPath(); trace(pts); fillStroke(fill); }
  function box(x0, y0, z0, x1, y1, z1, top = TOP, left = LEFT, right = RIGHT) {
    quad([[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], right);
    quad([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], left);
    quad([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], top);
  }
  function line(a, b) {
    ctx.beginPath(); ctx.moveTo(...P(a[0], a[1], a[2])); ctx.lineTo(...P(b[0], b[1], b[2])); ctx.stroke();
  }
  // Build a path in the 2D space of a plane: 'y' faces +y (u = +x, v = down), 'x' faces +x
  // (u = -y, v = down), 'z' is level (u = +x, v = +y). The transform is dropped before stroking so
  // lines keep one weight everywhere.
  function inPlane(plane, x, y, z, build) {
    ctx.save();
    ctx.translate(...P(x, y, z));
    if (plane === 'y') ctx.transform(C, S, 0, 1, 0, 0);
    else if (plane === 'x') ctx.transform(C, -S, 0, 1, 0, 0);
    else ctx.transform(C, S, -C, S, 0, 0);
    ctx.beginPath(); build(); ctx.restore();
  }
  function dot(plane, x, y, z, r, fill, stroke = true) {
    inPlane(plane, x, y, z, () => ctx.arc(0, 0, r, 0, TAU)); fillStroke(fill, stroke);
  }
  function faceText(plane, x, y, z, text, size) {
    ctx.save();
    ctx.translate(...P(x, y, z));
    ctx.transform(C, plane === 'y' ? S : -S, 0, 1, 0, 0);
    ctx.font = `800 ${size}px "Inter Tight", "Arial Black", sans-serif`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = '1.5px';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = INK;
    ctx.fillText(text, 0, 0.5);
    ctx.restore();
  }
  function sideFill(cx, rx) {
    const g = ctx.createLinearGradient(cx - rx, 0, cx + rx, 0);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, '#ffffff'); g.addColorStop(1, '#e3e5e8');
    return g;
  }
  // Upright frustum (a cylinder when r0 = r1)
  function frustum(cx, cy, z0, r0, z1, r1, topFill = TOP) {
    const [bx, by] = P(cx, cy, z0), [tx, ty] = P(cx, cy, z1);
    const brx = r0 * ISO_RX, bry = r0 * ISO_RY, trx = r1 * ISO_RX, try_ = r1 * ISO_RY;
    ctx.beginPath();
    ctx.moveTo(tx - trx, ty); ctx.lineTo(bx - brx, by);
    ctx.ellipse(bx, by, brx, bry, 0, Math.PI, 0, true);
    ctx.lineTo(tx + trx, ty);
    ctx.closePath();
    ctx.fillStyle = sideFill(bx, Math.max(brx, trx)); ctx.fill(); ctx.stroke();
    if (topFill) { ctx.beginPath(); ctx.ellipse(tx, ty, trx, try_, 0, 0, TAU); fillStroke(topFill); }
  }
  const cylinder = (cx, cy, z0, z1, r, topFill) => frustum(cx, cy, z0, r, z1, r, topFill);
  function ring(cx, cy, z, r) {
    const [x, y] = P(cx, cy, z);
    ctx.beginPath(); ctx.ellipse(x, y, r * ISO_RX, r * ISO_RY, 0, 0, Math.PI); ctx.stroke();
  }
  function band(cx, cy, z0, z1, r, fill) {
    const [x0, y0] = P(cx, cy, z0), [, y1] = P(cx, cy, z1), rx = r * ISO_RX, ry = r * ISO_RY;
    ctx.beginPath();
    ctx.ellipse(x0, y1, rx, ry, 0, 0, Math.PI);
    ctx.lineTo(x0 - rx, y0);
    ctx.ellipse(x0, y0, rx, ry, 0, Math.PI, 0, true);
    ctx.closePath(); fillStroke(fill);
  }
  function glow(on, fill = BLUE) { return on ? fill : TOP; }

  // ---------------------------------------------------------------------------------------------
  // Timing
  // ---------------------------------------------------------------------------------------------
  const liftZ = a => ZB + (ZH - ZB) * (ss(A_STOP + 0.02, A_STOP + 0.19, a) - ss(3.28, 3.42, a));
  const pushX = a => lerp(XL, XR, ss(A_PUSH, A_IN, a));
  const PLATE_REST = 429, PLATE_MAX = 520;
  function plateX(a) {
    if (a < A_PUSH) return lerp(PLATE_REST, XL - 18, ss(A_PUSH - 0.04, A_PUSH, a));
    if (a < A_IN) return Math.min(pushX(a) - 18, PLATE_MAX);
    return lerp(PLATE_MAX, PLATE_REST, ss(A_IN, 3.28, a));
  }
  // The character whose age is in [1.25, 2.25) is the one at the machine, [2.5, 3.5) at the lift
  const machineAge = ph => ph < 0.25 ? ph + 2 : ph + 1;
  const loaderAge = ph => ph >= 0.5 ? ph + 2 : ph + 3;
  const shutter = am => ss(1.71, 1.77, am) - ss(2.02, 2.08, am);

  function charAt(a) {
    const c = { a, x: 0, z: ZB, ground: ZB, sq: 0, pose: 'ride' };
    if (a < A_LAND) {
      const u = a / A_LAND;
      c.z = lerp(130, ZB, u * u);               // starts hidden inside the tube
      c.pose = 'fall';
    } else if (a < A_EASE) {
      c.x = (a - A_LAND) * D;
      const u = (a - A_LAND) / 0.14;             // landing: squash, a little hop, settle
      if (u < 1) {
        c.sq = 0.22 * Math.sin(u * TAU) * (1 - u);
        if (u > 0.5) c.z += 5 * Math.sin((u - 0.5) * TAU);
        c.pose = 'land';
      }
    } else if (a < A_PUSH) {
      c.x = a < A_STOP ? XE + (XL - XE) * (1 - Math.pow(1 - (a - A_EASE) / (A_STOP - A_EASE), 2)) : XL;
      c.z = c.ground = liftZ(a);
      if (a > A_STOP - 0.04) c.pose = 'wave';
    } else {
      c.x = pushX(a); c.z = c.ground = ZH; c.pose = 'slide';
    }
    c.bear = c.x >= XM;
    return c;
  }
  function characters(t) {
    const out = [], n = Math.floor(t / T);
    for (let k = n - 3; k <= n; k++) {
      const a = t / T - k;
      if (a >= 0 && a <= A_END && exists(k)) out.push(charAt(a));
    }
    return out.sort((p, q) => p.x - q.x);
  }

  // ---------------------------------------------------------------------------------------------
  // Characters, drawn flat and facing us at their projected feet
  // ---------------------------------------------------------------------------------------------
  function capsule(x, y, w, h) { ctx.beginPath(); ctx.roundRect(x, y, w, Math.max(w, h), w / 2); fillStroke(TOP); }
  function limb(x, y, ang, len, w) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang); capsule(-w / 2, -w / 2, w, len + w); ctx.restore();
  }
  // White fill, a pale crescent of shade on the lower right, then the outline
  function shaded(build, cx, cy, r) {
    build(); ctx.fillStyle = TOP; ctx.fill();
    ctx.save(); build(); ctx.clip();
    ctx.beginPath(); ctx.rect(-40, -80, 80, 90); ctx.arc(cx, cy, r, 0, TAU);
    ctx.fillStyle = SHADE; ctx.fill('evenodd'); ctx.restore();
    build(); ctx.stroke();
  }
  function pose(c, ph) {
    const w = Math.sin(ph * TAU * 12);
    switch (c.pose) {
      case 'fall': return { armL: 2.5, armR: 2.5, mouth: 'o', look: 0 };
      case 'land': return { armL: 0.9, armR: 0.9, mouth: 'smile', look: 0.5 };
      case 'wave': return { armL: 0.25, armR: 2.55 + Math.sin(ph * TAU * 14) * 0.35, mouth: 'smile', look: -0.6 };
      case 'slide': return { armL: 0.8, armR: 0.8, mouth: 'smile', look: 1 };
      default: return { armL: 0.22 - w * 0.12, armR: 0.22 + w * 0.12, mouth: 'smile', look: 1 };
    }
  }
  function drawFace(c, L, cy, eyeX) {
    const lk = L.look, blink = ((c.a * 2.3) % 1) < 0.025;
    ctx.fillStyle = CHEEK;
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(s * (eyeX + 2.6) + lk * 0.5, cy + 3.6, 1.8, 1.1, 0, 0, TAU); ctx.fill(); }
    ctx.fillStyle = INK;
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(s * eyeX + lk, cy, 1.25, blink ? 0.3 : 1.65, 0, 0, TAU); ctx.fill(); }
  }
  function drawHuman(c, L) {
    capsule(-6.5, -10, 5, 10);
    capsule(1.5, -10, 5, 10);
    limb(-8.5, -22, L.armL, 8, 4.4);
    limb(8.5, -22, -L.armR, 8, 4.4);
    shaded(() => { ctx.beginPath(); ctx.roundRect(-9.5, -27, 19, 19, 7.5); }, -3, -20, 12);
    ctx.fillStyle = INK;
    for (const y of [-18.5, -14]) { ctx.beginPath(); ctx.arc(0, y, 0.85, 0, TAU); ctx.fill(); }
    shaded(() => { ctx.beginPath(); ctx.arc(0, -36.5, 10.5, 0, TAU); }, -2.5, -38.5, 10);
    drawFace(c, L, -37, 3.7);
    const mx = L.look * 0.6;
    ctx.beginPath();
    if (L.mouth === 'o') { ctx.ellipse(mx, -31.6, 1.5, 2, 0, 0, TAU); ctx.fillStyle = INK; ctx.fill(); }
    else { ctx.arc(mx, -35.4, 3, 0.22 * Math.PI, 0.78 * Math.PI); ctx.stroke(); }
  }
  function drawBear(c, L) {
    capsule(-7.5, -8, 6, 8);
    capsule(1.5, -8, 6, 8);
    limb(-9.5, -19, L.armL, 7, 5);
    limb(9.5, -19, -L.armR, 7, 5);
    shaded(() => { ctx.beginPath(); ctx.ellipse(0, -14, 11.5, 10.5, 0, 0, TAU); }, -3, -16, 11);
    ctx.save(); ctx.lineWidth *= 0.7;
    ctx.beginPath(); ctx.ellipse(0, -12.5, 6.2, 6, 0, 0, TAU); fillStroke('#fafafb');
    ctx.restore();
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.arc(s * 8.9, -41, 4.3, 0, TAU); fillStroke(TOP);
      ctx.beginPath(); ctx.arc(s * 8.9, -41, 2.1, 0, TAU); fillStroke(DEEP, false);
    }
    // a wide, slightly squashed head
    shaded(() => { ctx.beginPath(); ctx.ellipse(0, -33.6, 12.4, 9.8, 0, 0, TAU); }, -2.5, -35.5, 10.5);
    drawFace(c, L, -35.4, 4.7);
    const sx = L.look * 0.8;
    ctx.beginPath(); ctx.ellipse(sx, -29.9, 5, 3.3, 0, 0, TAU); fillStroke(TOP);
    ctx.beginPath(); ctx.ellipse(sx, -31.1, 1.9, 1.2, 0, 0, TAU); ctx.fillStyle = INK; ctx.fill();
    ctx.beginPath(); ctx.moveTo(sx, -30); ctx.lineTo(sx, -29);
    ctx.moveTo(sx - 1.6, -28.6); ctx.quadraticCurveTo(sx, -28, sx + 1.6, -28.6); ctx.stroke();
    // the bow tie the machine adds
    ctx.beginPath();
    ctx.moveTo(0, -24); ctx.lineTo(-5.2, -27); ctx.lineTo(-5.2, -21); ctx.closePath();
    ctx.moveTo(0, -24); ctx.lineTo(5.2, -27); ctx.lineTo(5.2, -21); ctx.closePath();
    fillStroke(BLUE);
    ctx.beginPath(); ctx.ellipse(0, -24, 1.7, 1.9, 0, 0, TAU); fillStroke(BLUE);
  }
  // clip: how far the exit shutter is open, for a bear coming out of the machine (or undefined)
  function drawChar(c, ph, clip) {
    ctx.save();
    if (clip !== undefined) {
      // only what is past the exit face, or seen through the open part of the doorway
      ctx.beginPath();
      if (clip > 0.01) trace([[X1, -OPEN_W, ZB], [X1, OPEN_W, ZB], [X1, OPEN_W, ZB + OPEN_H * clip], [X1, -OPEN_W, ZB + OPEN_H * clip]]);
      const [lx] = P(X1, 0, 0);
      ctx.rect(lx, -2000, 4000, 4000);
      ctx.clip();
    }
    const sc = Math.max(0.3, 1 - (c.z - c.ground) / 130) * CS;
    inPlane('z', c.x, 0, c.ground, () => ctx.ellipse(0, 0, 11 * sc, 9 * sc, 0, 0, TAU));
    ctx.fillStyle = `rgba(20, 22, 30, ${0.1 * sc / CS})`; ctx.fill();
    const [sx, sy] = P(c.x, 0, c.z);
    ctx.translate(sx, sy);
    ctx.scale(CS * (1 + c.sq * 0.7), CS * (1 - c.sq));
    ctx.lineWidth = lw / CS;
    (c.bear ? drawBear : drawHuman)(c, pose(c, ph));
    ctx.restore();
  }

  // ---------------------------------------------------------------------------------------------
  // Machinery
  // ---------------------------------------------------------------------------------------------
  function drawChuteBack() {
    box(-11, -53, 0, 11, -31, 6);
    box(-4, -46, 6, 4, -38, 240);
    box(-3, -38, 150, 3, -15, 155);
    box(-3, -38, 212, 3, -15, 217);
  }
  // The chute: a square tube with rounded corners, a collar at the mouth and a cap on top
  const CHUTE = 15;
  function drawTube(ph, dropping) {
    const s = CHUTE, tube = rrFoot(-s, -s, s, s, 4), collar = rrFoot(-s - 4, -s - 4, s + 4, s + 4, 5);
    prism(collar, 108, collar, 118);
    prism(tube, 118, tube, 232, null);
    for (const z of [172, 204]) { line([-s + 4, s, z], [s - 4, s, z]); line([s, s - 4, z], [s, -s + 4, z]); }
    // a slot window on the front that lights as someone drops past
    inPlane('y', 0, s, 174, () => ctx.roundRect(-3.2, -50, 6.4, 100, 3.2));
    fillStroke(dropping && ph < 0.13 ? HALO : GLASS);
    prism(collar, 232, collar, 246);
    box(-5, -5, 246, 5, 5, 251, glow(dropping && ph < 0.2 && Math.sin(ph * TAU * 20) > -0.3));
  }

  function drawBelt(ph, xa, xb, legs) {
    const y0 = -BW / 2, y1 = BW / 2;
    for (const x of legs) {
      box(x - 3, y0 + 2, 0, x + 3, y0 + 8, ZB - 10);
      box(x - 3, y1 - 8, 0, x + 3, y1 - 2, ZB - 10);
    }
    box(xa, y0, ZB - 10, xb, y1, ZB, '#fbfbfc');
    ctx.save(); ctx.strokeStyle = MUTE; ctx.lineWidth = lw * 0.75;
    const off = (ph * D) % SLAT;
    for (let x = XS + off; x < XE; x += SLAT) if (x > xa + 2 && x < xb - 2) line([x, y0 + 4, ZB], [x, y1 - 4, ZB]);
    ctx.restore();
    box(xa, y0, ZB, xb, y0 + 4, ZB + 3);
    box(xa, y1 - 4, ZB, xb, y1, ZB + 3);
    // bolts along the side
    for (let x = XS + 24; x < XE - 10; x += 48) if (x > xa && x < xb) dot('y', x, y1, ZB - 5, 0.9, INK, false);
    // rollers at the ends, turning with the belt
    const a = ph * TAU * 10;
    for (const x of [XS + 6, XE - 6]) {
      if (x < xa || x > xb) continue;
      dot('y', x, y1, ZB - 5, 4, TOP);
      inPlane('y', x, y1, ZB - 5, () => { ctx.moveTo(Math.cos(a) * 4, Math.sin(a) * 4); ctx.lineTo(-Math.cos(a) * 4, -Math.sin(a) * 4); });
      ctx.stroke();
    }
    // blue direction chevrons on the side of the frame
    ctx.save(); ctx.strokeStyle = BLUE; ctx.lineWidth = lw * 1.4;
    for (const x0 of [44, 352]) {
      if (x0 < xa || x0 > xb) continue;
      for (let i = 0; i < 3; i++) inPlane('y', x0 + i * 6, y1, ZB - 5, () => { ctx.moveTo(-1.6, -2.6); ctx.lineTo(1.2, 0); ctx.lineTo(-1.6, 2.6); });
      ctx.stroke();
    }
    ctx.restore();
  }

  // Extruded footprints: f0 at z0 and f1 at z1 are matching point lists (x, y). Visible sides are
  // shaded by which way they face, and only real corners and silhouettes get an outline, so
  // rounded corners read as smooth and faceted ones as crisp.
  const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const FACE_A = rgb('#f9f9fa'), FACE_B = rgb('#e5e6e9');
  function shadeFor(nx, ny) {
    const t = clamp01((nx - ny + 1) / 2);
    return `rgb(${FACE_A.map((v, i) => Math.round(v + (FACE_B[i] - v) * t)).join(',')})`;
  }
  function prism(f0, z0, f1, z1, topFill = TOP) {
    const n = f0.length;
    let cx = 0, cy = 0;
    for (const p of f0) { cx += p[0] / n; cy += p[1] / n; }
    const norm = [], vis = [];
    for (let i = 0; i < n; i++) {
      const a = f0[i], b = f0[(i + 1) % n];
      let nx = b[1] - a[1], ny = a[0] - b[0];
      const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
      if (((a[0] + b[0]) / 2 - cx) * nx + ((a[1] + b[1]) / 2 - cy) * ny < 0) { nx = -nx; ny = -ny; }
      norm.push([nx, ny]); vis.push(nx + ny > 1e-6);
    }
    ctx.save(); ctx.lineWidth = lw * 0.5;
    for (let i = 0; i < n; i++) {
      if (!vis[i]) continue;
      const j = (i + 1) % n, col = shadeFor(norm[i][0], norm[i][1]);
      ctx.beginPath(); trace([[f0[i][0], f0[i][1], z0], [f0[j][0], f0[j][1], z0], [f1[j][0], f1[j][1], z1], [f1[i][0], f1[i][1], z1]]);
      ctx.fillStyle = col; ctx.strokeStyle = col; ctx.fill(); ctx.stroke();
    }
    ctx.restore();
    for (let i = 0; i < n; i++) {
      const p = (i + n - 1) % n, j = (i + 1) % n;
      const corner = vis[i] && vis[p] && norm[i][0] * norm[p][0] + norm[i][1] * norm[p][1] < 0.95;
      if (vis[i] !== vis[p] || corner) line([f0[i][0], f0[i][1], z0], [f1[i][0], f1[i][1], z1]);
      if (vis[i]) {
        line([f0[i][0], f0[i][1], z0], [f0[j][0], f0[j][1], z0]);
        if (!topFill) line([f1[i][0], f1[i][1], z1], [f1[j][0], f1[j][1], z1]);
      }
    }
    if (topFill) { ctx.beginPath(); trace(f1.map(p => [p[0], p[1], z1])); fillStroke(topFill); }
  }
  function rrFoot(x0, y0, x1, y1, r, seg = 6) {
    const out = [];
    for (const [cx, cy, a0] of [[x1 - r, y1 - r, 0], [x0 + r, y1 - r, 0.5], [x0 + r, y0 + r, 1], [x1 - r, y0 + r, 1.5]]) {
      for (let k = 0; k <= seg; k++) { const a = (a0 + k / seg * 0.5) * Math.PI; out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
    }
    return out;
  }
  // Regular polygon with a flat side facing each axis and one facing us (for n = 8)
  const polyFoot = (cx, cy, n, r) => Array.from({ length: n }, (_, k) => {
    const a = Math.PI / n + k * TAU / n;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  });
  const oct = r => polyFoot(XR, 0, 8, r);

  // ---------------------------------------------------------------------------------------------
  // The machine: a rounded block on a stepped base, a stamp and a wedge on the roof, a control
  // panel on the front and a roll-up shutter over the exit tunnel
  // ---------------------------------------------------------------------------------------------
  const ZBODY = 16;
  function drawMachineBase() {
    box(X0 - 22, -MD - 22, 0, X1 + 22, MD + 22, 8);
    box(X0 - 12, -MD - 12, 8, X1 + 12, MD + 12, ZBODY);
  }
  function drawMachine(ph, am) {
    const body = rrFoot(X0, -MD, X1, MD, 12);
    prism(body, ZBODY, body, MH);

    // front panel (+y): screen with a waveform, two buttons, progress lights, name plate
    const g = ss(1.38, 1.5, am) * (1 - ss(1.62, 1.74, am));   // how hard the machine is working
    inPlane('y', XM - 22, MD, 74, () => ctx.rect(-18, -14, 36, 28)); fillStroke('#f3f6fd');
    ctx.save(); ctx.strokeStyle = BLUE; ctx.lineWidth = lw * 1.2;
    const amp = 1.4 + 9 * g;
    inPlane('y', XM - 22, MD, 74, () => {
      for (let u = -15; u <= 15; u += 0.75) {
        const v = -amp * Math.sin(u * 0.55 + ph * TAU * 5) * Math.cos(u / 15 * Math.PI / 2);
        u === -15 ? ctx.moveTo(u, v) : ctx.lineTo(u, v);
      }
    });
    ctx.stroke(); ctx.restore();
    const ready = am >= 1.74 && am < 2.06, go = am >= 1.74 && am < 1.86 && Math.sin((am - 1.74) * TAU * 20) > 0;
    box(XM + 4, MD, 76, XM + 18, MD + 3, 88, ready ? HALO : TOP, ready ? HALO : LEFT, ready ? '#c3d3fb' : RIGHT);
    box(XM + 23, MD, 76, XM + 37, MD + 3, 88, go ? BLUE : HALO, go ? BLUE : HALO, go ? '#1647c9' : '#c3d3fb');
    let lit = 0;
    if (am > 1.3 && am < 1.74) lit = Math.min(5, Math.floor((am - 1.3) / 0.44 * 6));
    else if (am >= 1.74 && am < 1.84) lit = Math.sin((am - 1.74) * TAU * 25) > 0 ? 5 : 0;
    for (let i = 0; i < 5; i++) dot('y', XM + 6 + i * 7.6, MD, 66, 2.2, glow(i < lit));
    inPlane('y', XM, MD, 38, () => ctx.rect(-40, -8, 80, 16)); fillStroke(TOP);
    faceText('y', XM, MD, 38, 'BEARSTYLE', 10);

    // exit face (+x): tunnel with a roll-up shutter
    const open = shutter(am), door = [[X1, -OPEN_W, ZB], [X1, OPEN_W, ZB], [X1, OPEN_W, ZB + OPEN_H], [X1, -OPEN_W, ZB + OPEN_H]];
    ctx.save();
    ctx.beginPath(); trace(door); ctx.clip();
    ctx.fillStyle = DEEP; ctx.fill();
    quad([[X1, -OPEN_W, ZB], [X1 - 14, -OPEN_W, ZB], [X1 - 14, -OPEN_W, ZB + OPEN_H], [X1, -OPEN_W, ZB + OPEN_H]], '#e6e7ea');
    quad([[X1 - 40, -OPEN_W, ZB], [X1, -OPEN_W, ZB], [X1, OPEN_W, ZB], [X1 - 40, OPEN_W, ZB]], '#fbfbfc');
    if (open < 0.999) {
      const zb = ZB + OPEN_H * open;
      quad([[X1, -OPEN_W, zb], [X1, OPEN_W, zb], [X1, OPEN_W, ZB + OPEN_H + 1], [X1, -OPEN_W, ZB + OPEN_H + 1]], '#f1f2f4');
      ctx.save(); ctx.lineWidth = lw * 0.7;
      for (let z = zb + 6; z < ZB + OPEN_H; z += 6) line([X1, -OPEN_W, z], [X1, OPEN_W, z]);
      ctx.restore();
    }
    ctx.restore();
    ctx.beginPath(); trace(door); ctx.stroke();
    dot('x', X1, 0, ZB + OPEN_H + 7, 3, glow(open > 0.02));

    // roof: a D-shaped stamp that lifts and drops while the bear is made, and a wedge
    const lift = 12 * (ss(1.44, 1.5, am) - ss(1.53, 1.555, am)), sa = XM - 42, sr = 18;
    const stamp = [[sa, sr], [sa, -sr]];
    for (let k = 0; k <= 12; k++) { const a = -Math.PI / 2 + k / 12 * Math.PI; stamp.push([sa + 6 + Math.cos(a) * sr, Math.sin(a) * sr]); }
    prism(stamp, MH + lift, stamp, MH + lift + 22);
    const wx0 = XM + 4, wx1 = XM + 40, wy0 = -26, wy1 = 6, wh = 30;
    quad([[wx1, wy0, MH], [wx1, wy1, MH], [wx1, wy1, MH + wh], [wx1, wy0, MH + wh]], shadeFor(1, 0));
    quad([[wx0, wy1, MH], [wx1, wy1, MH], [wx1, wy1, MH + wh]], shadeFor(0, 1));
    quad([[wx0, wy0, MH], [wx1, wy0, MH + wh], [wx1, wy1, MH + wh], [wx0, wy1, MH]], TOP);
  }

  // ---------------------------------------------------------------------------------------------
  // Loading: a tapered lattice tower with the lift on its front, a bridge and a pusher
  // ---------------------------------------------------------------------------------------------
  const TW = { x0: 430, y0: -48, x1: 466, y1: -26, h: 216, taper: 5 };
  function towerPt(x, y, z) {
    const cx = (TW.x0 + TW.x1) / 2, cy = (TW.y0 + TW.y1) / 2, k = TW.taper * z / TW.h;
    return [x + Math.sign(cx - x) * k, y + Math.sign(cy - y) * k, z];
  }
  function drawTower() {
    const { x0, y0, x1, y1, h } = TW, step = 36;
    const faces = [[[x0, y0], [x0, y1], true], [[x0, y0], [x1, y0], true], [[x0, y1], [x1, y1], false], [[x1, y0], [x1, y1], false]];
    for (const [a, b, back] of faces) {
      ctx.save();
      if (back) ctx.strokeStyle = MUTE;
      ctx.lineWidth = lw * (back ? 0.7 : 0.9);
      for (const p of [a, b]) line(towerPt(p[0], p[1], 0), towerPt(p[0], p[1], h));
      for (let z = 0; z < h; z += step) {
        const z1 = Math.min(h, z + step);
        line(towerPt(a[0], a[1], z), towerPt(b[0], b[1], z));
        line(towerPt(a[0], a[1], z), towerPt(b[0], b[1], z1));
        line(towerPt(b[0], b[1], z), towerPt(a[0], a[1], z1));
      }
      ctx.restore();
    }
    const t0 = towerPt(x0, y0, h), t1 = towerPt(x1, y1, h);
    box(t0[0] - 2, t0[1] - 2, h, t1[0] + 2, t1[1] + 2, h + 6);
    // upper umbilical arm reaching over to the rocket
    const arm = [[x1 - 2, -36], [x1 - 2, -30], [XR - 20, -6], [XR - 20, -12]];
    prism(arm, 196, arm, 202);
    box(414, -32, ZH + 18, x0, -26, ZH + 24);
  }
  function drawPlatform(L) {
    const z = L.z, moving = L.a > A_STOP && L.a < A_STOP + 0.21 || L.a > 3.28 && L.a < 3.42;
    box(436, -26, z - 6, 442, -LS, z - 2);
    box(456, -26, z - 6, 462, -LS, z - 2);
    box(XL - LS, -LS, z - 6, XL + LS, LS, z);
    dot('y', XL, LS, z - 3, 1.6, glow(moving));
  }
  const BX1 = XR - 24;
  function drawBridge() {
    box(498, -12, 0, 502, -8, ZH - 5);
    box(XL + LS, -14, ZH - 5, BX1, 14, ZH);
    for (const x of [XL + LS + 2, 500]) box(x, -13, ZH, x + 2, -11, ZH + 12);
    line([XL + LS + 2, -12, ZH + 12], [BX1, -12, ZH + 12]);
  }
  function drawRail() {
    for (const x of [XL + LS + 2, 500, BX1 - 8]) box(x, 11, ZH, x + 2, 13, ZH + 12);
    line([XL + LS + 2, 12, ZH + 12], [BX1 - 1, 12, ZH + 12]);
  }
  function drawPusher(L) {
    box(414, -26, ZH + 18, 422, -9, ZH + 24);
    box(410, -9, ZH + 6, 428, 9, ZH + 24);
    dot('y', 419, 9, ZH + 15, 1.8, glow(L.a > A_PUSH - 0.04 && L.a < 3.28));
    const px = L.plate;
    if (px > 428.5) box(428, -2, ZH + 13, px, 2, ZH + 17);
    box(px, -9, ZH + 5, px + 3, 9, ZH + 25);
  }

  // ---------------------------------------------------------------------------------------------
  // The rocket: stacked eight-sided sections on a stepped pad, box boosters, blue windows
  // ---------------------------------------------------------------------------------------------
  function booster(dx, dy, dz) {
    const cx = XR + dx * 37, cy = dy * 37, f = [[cx - 6, cy - 6], [cx + 6, cy - 6], [cx + 6, cy + 6], [cx - 6, cy + 6]];
    prism(f, 14 + dz, f, 58 + dz, null);
    prism(f, 58 + dz, f.map(() => [cx, cy]), 76 + dz, null);
  }
  function faceQuad(r, a, z0, z1, w) {
    const ap = r * Math.cos(Math.PI / 8), cx = XR + ap * Math.cos(a), cy = ap * Math.sin(a), tx = -Math.sin(a) * w, ty = Math.cos(a) * w;
    return [[cx - tx, cy - ty, z0], [cx + tx, cy + ty, z0], [cx + tx, cy + ty, z1], [cx - tx, cy - ty, z1]];
  }
  function drawPad(al, frantic) {
    const loading = al > A_STOP && al < 3.3;
    box(XR - 48, -48, 0, XR + 48, 48, 8);
    box(XR - 40, -40, 8, XR + 40, 40, 14);
    ctx.save(); ctx.strokeStyle = MUTE;
    inPlane('z', XR, 0, 14, () => ctx.arc(0, 0, 34, 0, TAU)); ctx.stroke();
    ctx.restore();
    const chase = frantic ? Math.floor(performance.now() / 70) % 4 : Math.floor(al * 36) % 4, on = loading || frantic;
    for (let i = 0; i < 4; i++) {
      dot('y', XR - 30 + i * 20, 48, 4, 2, glow(on && chase === i));
      dot('x', XR + 48, 30 - i * 20, 4, 2, glow(on && chase === 3 - i));
    }
  }

  // The rocket is built from blocks so it can be stacked up one at a time and flown away whole.
  // Blocks 0-6 are the sections from the skirt up to the nose, 7-10 the boosters (-x, -y, +x, +y).
  const SECTIONS = [[14, 30, 20, 26], [30, 112, 28, 28], [112, 120, 31, 31], [120, 180, 26, 26], [180, 186, 29, 29], [186, 204, 24, 24]];
  const WHOLE = () => ({ dz: 0, alpha: 1 });
  // part(i) gives { dz, alpha } for a block, or null while it is not there yet
  function drawRocketBody(ph, al, part = WHOLE, noseLit = false) {
    const use = (i, draw) => {
      const p = part(i);
      if (!p || p.alpha <= 0) return;
      ctx.save(); ctx.globalAlpha = p.alpha; draw(p.dz); ctx.restore();
    };
    use(7, dz => booster(-1, 0, dz)); use(8, dz => booster(0, -1, dz));

    // the hatch (the far-left facet) swings open towards us while a bear goes in
    const o = ss(2.92, 3, al) - ss(3.21, 3.29, al);
    if (o > 0.01) use(3, dz => {
      const hx = XR - 24, hy = 9.95, phi = -Math.PI / 2 - o * 0.45 * Math.PI;
      const fx = hx + 19.9 * Math.cos(phi), fy = hy + 19.9 * Math.sin(phi);
      quad([[hx, hy, ZH + dz], [fx, fy, ZH + dz], [fx, fy, ZH + 56 + dz], [hx, hy, ZH + 56 + dz]], LEFT);
    });

    SECTIONS.forEach(([z0, z1, r0, r1], i) => use(i, dz => prism(oct(r0), z0 + dz, oct(r1), z1 + dz)));
    // windows on the three facets facing us; they turn blue once a bear is aboard
    const wg = ss(3.18, 3.24, al) * (1 - ss(3.32, 3.48, al));
    use(3, dz => {
      for (const a of [0, Math.PI / 4, Math.PI / 2]) {
        ctx.beginPath(); trace(faceQuad(26.3, a, 140 + dz, 160 + dz, 4.2)); fillStroke(HALO);
        if (wg > 0.01) { ctx.save(); ctx.globalAlpha *= wg; ctx.fillStyle = BLUE; ctx.fill(); ctx.restore(); }
      }
    });
    use(6, dz => {
      prism(oct(24), 204 + dz, oct(3), 262 + dz, null);
      for (const z of [222, 240]) {
        const f = oct(lerp(24, 3, (z - 204) / 58));
        for (let i = 0; i < 8; i++) {
          const a = Math.PI / 4 * i;
          if (Math.cos(a) + Math.sin(a) > 1e-6) line([...f[(i + 7) % 8], z + dz], [...f[i], z + dz]);
        }
      }
      const [tx, ty] = P(XR, 0, 262 + dz);
      ctx.beginPath(); ctx.arc(tx, ty - 2.4, 3, 0, TAU);
      fillStroke(glow(noseLit || al > A_STOP && al < 3.3 && Math.sin(ph * TAU * 16) > 0));
    });
    use(9, dz => booster(1, 0, dz)); use(10, dz => booster(0, 1, dz));
  }
  // Exhaust under the skirt: a flickering blue flame, size 0..1
  function drawFlame(dz, size, t) {
    if (size <= 0.01) return;
    const [bx, by] = P(XR, 0, 14 + dz), len = size * (62 + 8 * Math.sin(t * 47) + 5 * Math.sin(t * 83)), w = 14 * Math.min(1, size * 1.6);
    for (const [s, fill] of [[1, BLUE], [0.55, HALO]]) {
      ctx.beginPath();
      ctx.moveTo(bx - w * s, by);
      ctx.quadraticCurveTo(bx - w * s * 0.9, by + len * s * 0.55, bx, by + len * s);
      ctx.quadraticCurveTo(bx + w * s * 0.9, by + len * s * 0.55, bx + w * s, by);
      ctx.closePath(); fillStroke(fill, s === 1);
    }
  }
  // Smoke clouds rolling out across the pad from the moment of ignition
  function drawSmoke(t) {
    const puffs = [];
    for (let i = 0; i < 16; i++) {
      const u = (t - 0.5 - i * 0.11) / 2.8;
      if (u <= 0 || u >= 1) continue;
      const a = i * 2.39996, e = 1 - (1 - u) * (1 - u), d = 26 + 62 * e;
      puffs.push({ p: P(XR + Math.cos(a) * d, Math.sin(a) * d, 16 + 10 * u), r: 6 + 15 * e, alpha: 1 - u * u });
    }
    // outlines first at double weight, then every fill on top, so overlapping puffs merge into one cloud
    ctx.save(); ctx.strokeStyle = MUTE; ctx.lineWidth = lw * 2;
    for (const pass of ['stroke', 'fill']) {
      for (const { p, r, alpha } of puffs) {
        ctx.globalAlpha = alpha;
        ctx.beginPath(); ctx.arc(p[0], p[1] - r * 0.6, r, 0, TAU);
        if (pass === 'fill') { ctx.fillStyle = TOP; ctx.fill(); } else ctx.stroke();
      }
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------------------------------------
  // Soft ground shadows: drawn once per resize into an offscreen layer and blurred
  // ---------------------------------------------------------------------------------------------
  const boxPts = (x0, y0, z0, x1, y1, z1) => [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
  function cylPts(cx, cy, z0, z1, r) {
    const o = [];
    for (let i = 0; i < 20; i++) { const a = i / 20 * TAU, x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r; o.push([x, y, z0], [x, y, z1]); }
    return o;
  }
  const CASTERS = [
    boxPts(XS, -BW / 2, 0, XE, BW / 2, ZB),
    boxPts(X0 - 22, -MD - 22, 0, X1 + 22, MD + 22, 16),
    boxPts(X0, -MD, 16, X1, MD, MH + 30),
    boxPts(-11, -53, 0, 11, -31, 240),
    boxPts(-19, -19, 108, 19, 19, 251),
    boxPts(430, -48, 0, 466, -26, 222),
    boxPts(XL + LS, -14, ZH - 5, XR - RR, 14, ZH),
    boxPts(XR - 46, -46, 0, XR + 46, 46, 14),
    cylPts(XR, 0, 14, 204, 29).concat([[XR, 0, 262]]),
  ];
  const toGround = ([x, y, z]) => [x + z * 0.12, y + z * 0.34, 0];
  function hull(pts) {
    pts = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], up = [];
    for (const p of pts) { while (lo.length > 1 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
    for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length > 1 && cross(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
    lo.pop(); up.pop();
    return lo.concat(up);
  }

  // Scene bounds, shadows included, to fit the drawing into the canvas
  const BOUNDS = (() => {
    const pts = [];
    for (const set of CASTERS) for (const p of set) pts.push(P(...p), P(...toGround(p)));
    pts.push(P(XM + 30, 22, MH + 52), P(0, 0, 252), P(XR + RR + 19, 0, 14), P(XR, RR + 19, 14));
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    return { x0: Math.min(...xs) - 6, x1: Math.max(...xs) + 6, y0: Math.min(...ys) - 6, y1: Math.max(...ys) + 6 };
  })();

  let dpr = 1, k = 1, ox = 0, oy = 0, shadowLayer = null, rocketShadow = null;
  function makeShadow(sets) {
    const raw = document.createElement('canvas');
    raw.width = canvas.width; raw.height = canvas.height;
    const rc = raw.getContext('2d');
    rc.setTransform(dpr * k, 0, 0, dpr * k, dpr * ox, dpr * oy);
    rc.fillStyle = '#000';
    for (const set of sets) {
      const g = hull(set.map(p => toGround(p)));
      rc.beginPath();
      g.forEach((p, i) => { const [sx, sy] = P(p[0], p[1], 0); i ? rc.lineTo(sx, sy) : rc.moveTo(sx, sy); });
      rc.closePath(); rc.fill();
    }
    const out = document.createElement('canvas');
    out.width = raw.width; out.height = raw.height;
    const sc = out.getContext('2d');
    sc.filter = `blur(${Math.round(5 * dpr * Math.max(0.6, k))}px)`;
    sc.drawImage(raw, 0, 0);
    return out;
  }
  function resize() {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    const bw = BOUNDS.x1 - BOUNDS.x0, bh = BOUNDS.y1 - BOUNDS.y0;
    k = Math.min(r.width / bw, r.height / bh);
    ox = (r.width - bw * k) / 2 - BOUNDS.x0 * k;
    oy = (r.height - bh * k) / 2 - BOUNDS.y0 * k;
    lw = Math.max(0.85, Math.min(1.35, k * 0.6)) / k;
    shadowLayer = makeShadow(CASTERS.slice(0, -1));
    rocketShadow = makeShadow(CASTERS.slice(-1));
    render(simT);
  }

  // ---------------------------------------------------------------------------------------------
  // Launch sequence. 'run' is the normal loop. 'drain': no new humans drop and the factory runs at
  // triple speed until the last bear is aboard. 'launch': countdown, then the rocket flies up and
  // off the page on a layer above it. 'build': a new rocket is stacked block by block, then the
  // loop picks up again at the next cycle. Characters are numbered by the cycle they are born in.
  // ---------------------------------------------------------------------------------------------
  const IGNITE = 1.4;                                       // seconds of countdown before lift-off
  const BUILD_DELAY = 0.5, BUILD_STEP = 0.3, BUILD_DROP = 0.5, BUILD_END = BUILD_DELAY + 10 * BUILD_STEP + BUILD_DROP + 0.3;
  let mode = 'run', stopK = Infinity, launchT = 0, buildAt = 0, flightDone = false, warp = 1;
  const gaps = [];                                          // [first, last] cycles that had no human
  const exists = n => n <= stopK && !gaps.some(([a, b]) => n >= a && n <= b);
  const flightZ = () => { const s = launchT - IGNITE; return s > 0 ? 70 * s * s + 15 * s : 0; };
  function buildPart(i) {
    const u = (launchT - buildAt - BUILD_DELAY - i * BUILD_STEP) / BUILD_DROP;
    if (u <= 0) return null;
    const e = 1 - Math.pow(1 - clamp01(u), 3);
    return { dz: 90 * (1 - e), alpha: clamp01(u * 2.5) };
  }
  function rocketPresence() {
    if (mode === 'launch') return 1 - clamp01(flightZ() / 200);
    if (mode === 'build') { let n = 0; for (let i = 0; i < 11; i++) { const p = buildPart(i); n += p ? p.alpha : 0; } return n / 11; }
    return 1;
  }

  let sky = null, sctx = null;
  function skyLayer() {
    if (!sky) {
      sky = document.createElement('canvas');
      sky.className = 'sky'; sky.setAttribute('aria-hidden', 'true');
      document.body.appendChild(sky);
      sctx = sky.getContext('2d');
    }
    const w = Math.round(innerWidth * dpr), h = Math.round(innerHeight * dpr);
    if (sky.width !== w || sky.height !== h) { sky.width = w; sky.height = h; }
    return sctx;
  }
  function removeSky() { if (sky) { sky.remove(); sky = null; sctx = null; } }
  function renderSky(ph, al) {
    const s = skyLayer(), r = canvas.getBoundingClientRect();
    const fs = launchT - IGNITE, fz = flightZ();
    const shake = Math.sin(launchT * 73) * 0.7 * ss(0, 0.6, launchT) * (1 - ss(0, 0.8, fs));
    s.setTransform(1, 0, 0, 1, 0, 0);
    s.clearRect(0, 0, sky.width, sky.height);
    s.setTransform(dpr * k, 0, 0, dpr * k, dpr * (r.left + ox + shake * k), dpr * (r.top + oy));
    ctx = s;
    ctx.lineWidth = lw; ctx.strokeStyle = INK; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    drawFlame(fz, fs < 0 ? 0.55 * ss(0.3, IGNITE, launchT) : 0.55 + 0.45 * ss(0, 0.6, fs), launchT);
    drawRocketBody(ph, al, () => ({ dz: fz, alpha: 1 }), true);
    ctx = main;
    if (r.top + oy + k * (P(XR, 0, 14 + fz)[1] + 60) < 0) flightDone = true;
  }

  // ---------------------------------------------------------------------------------------------
  // One frame
  // ---------------------------------------------------------------------------------------------
  function render(t) {
    const ph = ((t / T) % 1 + 1) % 1, cyc = t / T;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (shadowLayer) {
      ctx.globalAlpha = 0.07; ctx.drawImage(shadowLayer, 0, 0);
      ctx.globalAlpha = 0.07 * rocketPresence(); ctx.drawImage(rocketShadow, 0, 0);
      ctx.globalAlpha = 1;
    }
    ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * ox, dpr * oy);
    ctx.lineWidth = lw; ctx.strokeStyle = INK; ctx.lineJoin = 'round'; ctx.lineCap = 'round';

    // Stations with nobody to work on sit idle
    let am = machineAge(ph), al = loaderAge(ph);
    if (!exists(Math.round(cyc - am))) am = 1.25;
    if (!exists(Math.round(cyc - al))) al = 2.5;
    const chars = characters(t), lift = { a: al, z: liftZ(al), plate: plateX(al) };
    const open = shutter(am);

    // Back to front: what sits behind the machine, the machine, then what sits in front of it
    drawChuteBack();
    drawMachineBase();
    drawBelt(ph, XS, X0 + 10, [XS + 16, 100]);
    for (const c of chars) if (c.x < X1 - 34) drawChar(c, ph);
    drawTube(ph, exists(Math.floor(cyc)));
    drawMachine(ph, am);
    drawTower();
    drawBelt(ph, X1, XE, [340, XE - 16]);
    drawPlatform(lift);
    drawBridge();
    drawPusher(lift);
    for (const c of chars) if (c.x >= X1 - 34) drawChar(c, ph, c.x < X1 + 24 ? open : undefined);
    drawRail();
    drawPad(al, mode === 'launch' && launchT < IGNITE + 1);
    if (mode === 'build') drawRocketBody(ph, al, buildPart);
    else if (mode !== 'launch') drawRocketBody(ph, al);
    if (mode === 'launch' || mode === 'build') drawSmoke(launchT);
    if (mode === 'launch') renderSky(ph, al);
  }

  // ---------------------------------------------------------------------------------------------
  // Clock, counter, launch button
  // ---------------------------------------------------------------------------------------------
  function stockholmSeconds() {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Stockholm', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' })
      .formatToParts(new Date());
    const get = type => +(parts.find(p => p.type === type) || { value: 0 }).value;
    return get('hour') * 3600 + get('minute') * 60 + get('second') + (Date.now() % 1000) / 1000;
  }
  let simT = stockholmSeconds();
  if (RM) simT = Math.floor(simT / T) * T + 0.32 * T;   // a still frame with every stage busy
  const FROZEN = new URLSearchParams(location.search).get('ph');  // ?ph=0.5 freezes the cycle for screenshots
  if (FROZEN !== null) simT = Math.floor(simT / T) * T + (parseFloat(FROZEN) || 0) * T;
  // ?launch=2 or ?build=1.5 freezes the launch sequence that many seconds in, for screenshots
  const SEQ = new URLSearchParams(location.search), SEQ_FROZEN = SEQ.has('launch') || SEQ.has('build');
  if (SEQ_FROZEN) {
    stopK = Math.floor(simT / T) - 4;
    mode = SEQ.has('launch') ? 'launch' : 'build';
    launchT = parseFloat(SEQ.get(mode)) || 0;
  }
  let shown = -1;
  function updateCount() {
    if (!countEl) return;
    const top = Math.floor(simT / T - A_IN);              // the newest bear that would be aboard
    let n = top + 1;
    for (const [a, b] of gaps) n -= Math.max(0, Math.min(b, top) - a + 1);
    if (stopK < Infinity) n -= Math.max(0, top - stopK);
    n = Math.max(0, n);
    if (n !== shown) { shown = n; countEl.textContent = n.toLocaleString('en-GB'); }
  }

  const LABELS = { run: 'Launch', drain: 'Boarding…', launch: 'Lift-off!', build: 'Building a new rocket…' };
  function label() {
    if (!toggle) return;
    toggle.textContent = LABELS[mode];
    toggle.disabled = mode !== 'run';
  }
  function resume() {
    const next = Math.ceil(simT / T + 1e-6);              // humans drop again from the next cycle
    gaps.push([stopK + 1, next - 1]);
    stopK = Infinity; mode = 'run'; label();
  }
  function step(dt) {
    warp += ((mode === 'drain' ? 3 : 1) - warp) * Math.min(1, dt * 2.5);
    simT += dt * warp;
    if (mode === 'drain') {
      if (simT / T >= stopK + 3.3) { mode = 'launch'; launchT = 0; flightDone = false; label(); }
    } else if (mode === 'launch' || mode === 'build') {
      launchT += dt;
      if (mode === 'launch' && (flightDone || launchT > IGNITE + 6)) { mode = 'build'; buildAt = launchT; removeSky(); label(); }
      else if (mode === 'build' && launchT - buildAt > BUILD_END) resume();
    }
  }

  let playing = !RM && FROZEN === null && !SEQ_FROZEN, onScreen = true, raf = 0, last = 0;
  function frame(now) {
    raf = 0;
    // keep going off-screen while a launch is under way, so the flight layer never freezes
    if (!playing || !onScreen && mode === 'run') return;
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
    last = now;
    step(dt);
    render(simT);
    updateCount();
    raf = requestAnimationFrame(frame);
  }
  function start() { if (!raf && playing && (onScreen || mode !== 'run')) { last = 0; raf = requestAnimationFrame(frame); } }

  if (toggle) {
    if (FROZEN !== null || SEQ_FROZEN) toggle.hidden = true;
    label();
    toggle.addEventListener('click', () => {
      if (mode !== 'run') return;
      stopK = Math.floor(simT / T);                         // whoever already dropped finishes the trip
      mode = 'drain'; playing = true; label(); pauseLabel(); start();
    });
  }
  function pauseLabel() {
    if (!pauseBtn) return;
    pauseBtn.setAttribute('aria-pressed', String(!playing));
    pauseBtn.setAttribute('aria-label', playing ? 'Pause animation' : 'Play animation');
  }
  if (pauseBtn) {
    if (FROZEN !== null || SEQ_FROZEN) pauseBtn.hidden = true;
    pauseLabel();
    pauseBtn.addEventListener('click', () => { playing = !playing; pauseLabel(); start(); });
  }
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; start(); }).observe(canvas);
  }
  new ResizeObserver(resize).observe(canvas);
  if (document.fonts) document.fonts.ready.then(() => render(simT));
  resize();
  updateCount();
  start();
})();
