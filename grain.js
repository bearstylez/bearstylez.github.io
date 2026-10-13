// Grainy title draft for bearstyle.se.
// The word is re-dithered ~12 times a second from its mask, so a fine grain trembles inside near-solid
// ink. On load it resolves in: blurry fragments appear at random spots, sharpen, and the word settles
// from slightly too big. Orange and blue specks bloom and fade inside it as you scroll, and the site's
// questions and answers type out underneath. ?p=0.5 freezes the scroll position for screenshots.
(() => {
  'use strict';

  const WORD = 'bearstyle.';
  const PASSAGES = [
    { q: 'What is bearstyle?', a: [["That's me. My name is Fredrik Andersson, happy to see you here."]] },
    { q: 'What is this site for?', a: [["It's just a simple creative outlet for my personal domain."]] },
    { q: "What's up right now?", a: [["I'm currently the IT manager at a fantastic games studio in Stockholm, Sweden. But I'm always up for new exciting adventures!"]] },
    { q: 'Wanna find out more about me?', a: [['You can find me on '], ['LinkedIn', 'https://se.linkedin.com/in/bearstyle'],
      [' or reach me by email at '], ['hello@bearstyle.se', 'mailto:hello@bearstyle.se'], [' - feel free to say hi!']] },
  ];
  const ORANGE = [255, 138, 30], BLUE = [128, 148, 232];
  // Where each speck pools (u across the word, v down it, 0..1), how far it drifts over the whole
  // scroll, its size in word heights, and when it blooms (scroll progress) and for how long.
  const SPECKS = [
    { c: ORANGE, u: [.30, .40], v: .85, r: .55, peak: 0, w: .2 },
    { c: BLUE, u: [.90, .78], v: .80, r: .6, peak: .1, w: .26 },
    { c: ORANGE, u: [.62, .52], v: .85, r: .5, peak: .4, w: .18 },
    { c: BLUE, u: [.08, .2], v: .80, r: .55, peak: .55, w: .2 },
    { c: ORANGE, u: [.92, .82], v: .75, r: .5, peak: .76, w: .18 },
    { c: BLUE, u: [.46, .36], v: .82, r: .6, peak: 1, w: .2 },
  ];
  const TICK_MS = 83;            // ~12fps: the grain pops rather than flows
  const INTRO_DELAY = 250, INTRO_MS = 1300;
  const TYPE_FROM = .03, TYPE_TO = .97;

  const qs = new URLSearchParams(location.search);
  const FROZEN = qs.has('p') ? Math.min(1, Math.max(0, parseFloat(qs.get('p')) || 0)) : null;
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const clamp01 = v => Math.min(1, Math.max(0, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  let seed = 0x9e3779b9;
  const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };

  const $ = id => document.getElementById(id);
  const canvas = $('word'), ctx = canvas.getContext('2d');
  const dust = $('dust'), dctx = dust.getContext('2d');
  const copyEl = $('copy'), hint = $('hint');

  // ---------------------------------------------------------------------------------------------
  // The word: a crisp mask (settled) and a very soft one (start of the intro), each turned into a
  // per-pixel ink probability, plus a smooth random field that decides when each spot appears.
  // ---------------------------------------------------------------------------------------------
  let M = null;
  const CELL = 4;

  function boxBlur(a, w, h, r) {
    if (r < 1) return;
    const tmp = new Float32Array(a.length), n = 2 * r + 1;
    for (let y = 0; y < h; y++) {
      let s = 0;
      const row = y * w;
      for (let x = -r; x <= r; x++) s += a[row + Math.min(w - 1, Math.max(0, x))];
      for (let x = 0; x < w; x++) {
        tmp[row + x] = s / n;
        s += a[row + Math.min(w - 1, x + r + 1)] - a[row + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let y = -r; y <= r; y++) s += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
      for (let y = 0; y < h; y++) {
        a[y * w + x] = s / n;
        s += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
      }
    }
  }
  const blurred = (src, w, h, r) => { const a = Float32Array.from(src); for (let k = 0; k < 3; k++) boxBlur(a, w, h, r); return a; };

  /** Smooth value noise in 0..1 with blobs about `size` px across. */
  function valueNoise(w, h, size) {
    const gw = Math.ceil(w / size) + 2, gh = Math.ceil(h / size) + 2;
    const g = new Float32Array(gw * gh).map(() => rnd());
    const out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      const fy = y / size, y0 = fy | 0, ty = smoothstep(0, 1, fy - y0);
      for (let x = 0; x < w; x++) {
        const fx = x / size, x0 = fx | 0, tx = smoothstep(0, 1, fx - x0);
        const a = g[y0 * gw + x0], b = g[y0 * gw + x0 + 1], c = g[(y0 + 1) * gw + x0], d = g[(y0 + 1) * gw + x0 + 1];
        out[y * w + x] = lerp(lerp(a, b, tx), lerp(c, d, tx), ty);
      }
    }
    return out;
  }

  function layout() {
    const W = innerWidth, H = innerHeight, portrait = W < H;
    const off = document.createElement('canvas'), o = off.getContext('2d');
    const setFont = fs => { o.font = `800 ${fs}px "Inter Tight"`; if ('letterSpacing' in o) o.letterSpacing = `${-.045 * fs}px`; };
    setFont(100);
    const w100 = o.measureText(WORD).width;
    // Work in device pixels (capped at 2x) so the grain stays fine on phones and retina screens
    const S = Math.min(2, devicePixelRatio || 1);
    const fs = Math.min((portrait ? .86 : .64) * W / w100 * 100, .34 * H) * S;

    setFont(fs);
    const m = o.measureText(WORD);
    const asc = m.actualBoundingBoxAscent, desc = m.actualBoundingBoxDescent;
    const sharpR = Math.max(1, Math.round(fs * .005)), softR = Math.max(3, Math.round(fs * .05));
    const pad = softR * 3 + 2;
    const tw = Math.ceil(m.actualBoundingBoxRight + m.actualBoundingBoxLeft), th = Math.ceil(asc + desc);
    const w = tw + 2 * pad, h = th + 2 * pad;
    off.width = w; off.height = h;
    setFont(fs);
    o.fillText(WORD, pad + m.actualBoundingBoxLeft, pad + asc);

    const data = o.getImageData(0, 0, w, h).data;
    const raw = new Float32Array(w * h);
    for (let i = 0; i < raw.length; i++) raw[i] = data[i * 4 + 3] / 255;
    const sharp = blurred(raw, w, h, sharpR), soft = blurred(raw, w, h, softR);
    const reveal = valueNoise(w, h, Math.max(12, th * .45));

    // Near-solid ink with a fine grain inside; only a thin fuzz at the edges
    const inkSharp = a => Math.pow(clamp01((a - .12) / .5), .9) * .99;
    const inkSoft = a => Math.pow(clamp01((a - .04) / .45), .8) * .97;
    const cw = Math.ceil(w / CELL), ch = Math.ceil(h / CELL);
    const idx = [], ps = [], pf = [], rv = [], cell = [];
    for (let i = 0; i < raw.length; i++) {
      const s = inkSharp(sharp[i]), f = inkSoft(soft[i]);
      if (s < .004 && f < .004) continue;
      idx.push(i); ps.push(s); pf.push(f); rv.push(reveal[i]);
      cell.push((((i / w) | 0) / CELL | 0) * cw + ((i % w) / CELL | 0));
    }
    canvas.width = w; canvas.height = h;
    canvas.style.width = `${w / S}px`; canvas.style.height = `${h / S}px`;
    const top = H * .44 - (pad + asc * .62) / S;
    canvas.style.top = `${top}px`;
    M = { w, h, idx: Int32Array.from(idx), ps: Float32Array.from(ps), pf: Float32Array.from(pf), rv: Float32Array.from(rv),
      cell: Int32Array.from(cell), cw, ch, fO: new Float32Array(cw * ch), fB: new Float32Array(cw * ch),
      img: ctx.createImageData(w, h), tx: pad, ty: pad, tw, th };

    copyEl.style.top = `${top + (h - pad) / S + Math.max(28, H * .055)}px`;
    hint.style.top = copyEl.style.top;
    dust.width = W; dust.height = H;
    lastW = W; lastH = H;
  }

  /** Orange/blue weight per 4x4 cell for this scroll position (cheaper than per pixel). */
  function specks(p) {
    const { cw, ch, fO, fB, tx, ty, tw, th } = M;
    fO.fill(0); fB.fill(0);
    for (const s of SPECKS) {
      const k = Math.exp(-Math.pow((p - s.peak) / s.w, 2));
      if (k < .02) continue;
      const su = lerp(s.u[0], s.u[1], p), r2 = s.r * s.r;
      const f = s.c === ORANGE ? fO : fB;
      for (let cy = 0; cy < ch; cy++) {
        const v = ((cy + .5) * CELL - ty) / th;
        for (let cx = 0; cx < cw; cx++) {
          const du = (((cx + .5) * CELL - tx) / tw - su) * tw / th, dv = v - s.v;
          f[cy * cw + cx] += k * Math.exp(-(du * du + dv * dv) / r2);
        }
      }
    }
  }

  /** t: intro progress 0..1 (1 = settled). */
  function drawWord(p, t) {
    specks(p);
    const { idx, ps, pf, rv, cell, fO, fB, img } = M;
    const d = img.data;
    d.fill(0);
    const settled = t >= 1;
    const sharpness = easeOut(clamp01(t * 1.15));      // blur resolves to crisp
    const front = t * 1.15 - .08;                       // spots appear as the front passes their reveal value
    const flicker = RM || !settled ? 1 : .985 + rnd() * .015;
    for (let n = 0; n < idx.length; n++) {
      let pr = ps[n];
      if (!settled) pr = lerp(pf[n], ps[n], sharpness) * smoothstep(rv[n] - .04, rv[n] + .04, front);
      if (pr <= 0 || rnd() >= pr * flicker) continue;
      const c = cell[n];
      // Full color where a speck pools, fading into the ink around it
      let wo = smoothstep(.06, .6, fO[c]), wb = smoothstep(.06, .6, fB[c]);
      if (wo + wb > 1) { const s = 1 / (wo + wb); wo *= s; wb *= s; }
      // Blend ink toward the speck colors (a little noise on the mix keeps it grainy, not salt-and-pepper)
      const jit = (rnd() - .5) * .18;
      const ko = clamp01(wo + (wo > .01 ? jit : 0)), kb = clamp01(wb + (wb > .01 ? jit : 0)), ki = Math.max(0, 1 - ko - kb);
      const v = 34 + rnd() * 12, o = idx[n] * 4;
      d[o] = v * ki + ORANGE[0] * ko + BLUE[0] * kb;
      d[o + 1] = v * .98 * ki + ORANGE[1] * ko + BLUE[1] * kb;
      d[o + 2] = v * .95 * ki + ORANGE[2] * ko + BLUE[2] * kb;
      d[o + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    // The word settles from a little too big, like a camera finding focus
    canvas.style.transform = `translateX(-50%) scale(${1 + .22 * (1 - easeOut(t))})`;
  }

  // Dust: a few specks and hairs that pop in and out with the grain
  function drawDust() {
    const W = dust.width, H = dust.height;
    dctx.clearRect(0, 0, W, H);
    dctx.fillStyle = dctx.strokeStyle = 'rgba(30, 28, 25, .3)';
    const n = 4 + (rnd() * 6) | 0;
    for (let i = 0; i < n; i++) {
      dctx.beginPath();
      dctx.arc(rnd() * W, rnd() * H, .5 + rnd() * 1.1, 0, Math.PI * 2);
      dctx.fill();
    }
    if (rnd() < .3) {
      const x = rnd() * W, y = rnd() * H, l = 6 + rnd() * 14;
      dctx.lineWidth = .7;
      dctx.beginPath();
      dctx.moveTo(x, y);
      dctx.quadraticCurveTo(x + l * (rnd() - .5), y + l * .6, x + l * (rnd() - .5), y + l);
      dctx.stroke();
    }
  }

  // Paper noise tile, made once: fine, low-contrast salt and pepper
  function makeGrainTile() {
    const s = 220, c = document.createElement('canvas');
    c.width = c.height = s;
    const g = c.getContext('2d'), im = g.createImageData(s, s), d = im.data;
    for (let i = 0; i < s * s; i++) {
      const v = rnd(), o = i * 4;
      if (v < .5) { d[o] = d[o + 1] = d[o + 2] = 30; d[o + 3] = (.5 - v) * 42; }
      else { d[o] = d[o + 1] = d[o + 2] = 255; d[o + 3] = (v - .5) * 42; }
    }
    g.putImageData(im, 0, 0);
    document.querySelector('.grain').style.backgroundImage = `url(${c.toDataURL()})`;
  }

  // ---------------------------------------------------------------------------------------------
  // Typed copy: one question + answer at a time, typed by scrolling (layout is fixed up front)
  // ---------------------------------------------------------------------------------------------
  const passages = [];
  const caret = document.createElement('span');
  caret.className = 'caret';

  function typeInto(parent, text, chars) {
    let word = null;
    for (const chr of text) {
      const s = document.createElement('span');
      s.className = 'ch'; s.textContent = chr;
      if (chr === ' ') { word = null; parent.appendChild(s); }
      else {
        if (!word) { word = parent.appendChild(document.createElement('span')); word.className = 'word'; }
        word.appendChild(s);
      }
      chars.push(s);
    }
  }

  function buildCopy() {
    const sr = document.createElement('div'); // the full text for screen readers and search engines
    sr.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)';
    PASSAGES.forEach(({ q, a }, n) => {
      const el = document.createElement('div'), chars = [], links = [];
      el.className = 'qa'; el.setAttribute('aria-hidden', 'true');
      typeInto(el.appendChild(Object.assign(document.createElement('p'), { className: 'q' })), `[0${n + 1}] ${q}`, chars);
      const ans = el.appendChild(Object.assign(document.createElement('p'), { className: 'a' }));
      sr.appendChild(document.createElement('h2')).textContent = q;
      const srp = sr.appendChild(document.createElement('p'));
      a.forEach(([text, href]) => {
        let parent = ans;
        if (href) {
          parent = ans.appendChild(document.createElement('a'));
          parent.href = href; parent.tabIndex = -1;
          if (href.startsWith('http')) { parent.target = '_blank'; parent.rel = 'noopener'; }
          links.push({ a: parent, end: chars.length + [...text].length });
          Object.assign(srp.appendChild(document.createElement('a')), { href, textContent: text });
        } else srp.appendChild(document.createTextNode(text));
        typeInto(parent, text, chars);
      });
      el.hidden = true;
      copyEl.appendChild(el);
      passages.push({ el, chars, links, shown: 0 });
    });
    document.body.appendChild(sr);
  }

  let active = -1;
  function poseCopy(p) {
    const n = passages.length, seg = (TYPE_TO - TYPE_FROM) / n;
    const k = Math.min(n - 1, Math.max(0, Math.floor((p - TYPE_FROM) / seg)));
    const t = RM ? 1 : clamp01((p - TYPE_FROM - k * seg) / (seg * .7));
    if (k !== active) { passages.forEach((ps, i) => { ps.el.hidden = i !== k; }); active = k; }
    const cur = passages[k], count = Math.round(cur.chars.length * t);
    if (count !== cur.shown) {
      const [a, b] = count > cur.shown ? [cur.shown, count] : [count, cur.shown];
      for (let i = a; i < b; i++) cur.chars[i].classList.toggle('on', i < count);
      cur.shown = count;
    }
    const at = cur.chars[count - 1];
    if (at) at.after(caret); else cur.el.querySelector('.q').prepend(caret);
    for (const l of cur.links) l.a.style.pointerEvents = count >= l.end ? 'auto' : 'none';
    const started = p > TYPE_FROM * .5;
    hint.style.visibility = started ? 'hidden' : '';
    copyEl.style.visibility = started ? 'visible' : 'hidden';
  }

  // ---------------------------------------------------------------------------------------------
  // Wiring
  // ---------------------------------------------------------------------------------------------
  let lastW = 0, lastH = 0, t0 = 0, lastTick = 0;
  const progress = () => {
    if (FROZEN != null) return FROZEN;
    const max = document.documentElement.scrollHeight - innerHeight;
    return max > 0 ? clamp01(scrollY / max) : 0;
  };
  const INTRO_AT = qs.has('intro') ? clamp01(parseFloat(qs.get('intro')) || 0) : null; // ?intro=0.4 freezes the intro
  const introT = now => INTRO_AT ?? (FROZEN != null || RM ? 1 : clamp01((now - t0 - INTRO_DELAY) / INTRO_MS));

  function loop(now) {
    const t = introT(now);
    // During the intro draw every frame so the resolve is smooth; after that pop at ~12fps
    if (t < 1 || now - lastTick >= TICK_MS) {
      lastTick = now;
      drawWord(progress(), t);
      drawDust();
      if (t > .75) document.body.classList.add('settled');
    }
    requestAnimationFrame(loop);
  }

  // Nudge the scroll arrow once the visitor has done nothing for a while; any input resets the wait
  const IDLE_MS = 5000;
  let idleTimer = 0;
  function armNudge() {
    hint.classList.remove('nudge');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => hint.classList.add('nudge'), IDLE_MS);
  }

  function still() { seed = 0x9e3779b9; drawWord(progress(), 1); } // reduced motion: one stable frame per change

  Promise.all([document.fonts.load('800 100px "Inter Tight"'), document.fonts.load('500 14px Inter'), document.fonts.load('600 14px Inter')])
    .catch(() => {})
    .then(() => {
      makeGrainTile();
      buildCopy();
      layout();
      poseCopy(progress());
      document.body.classList.add('ready');
      t0 = performance.now();
      if (RM) { document.body.classList.add('settled'); still(); } else requestAnimationFrame(loop);
      addEventListener('scroll', () => { poseCopy(progress()); if (RM) still(); }, { passive: true });
      for (const type of ['scroll', 'wheel', 'pointermove', 'pointerdown', 'touchstart', 'keydown'])
        addEventListener(type, armNudge, { passive: true });
      armNudge();
      addEventListener('resize', () => {
        if (innerWidth === lastW && Math.abs(innerHeight - lastH) < 120) return;
        layout(); poseCopy(progress()); if (RM) still();
      });
    });
})();
