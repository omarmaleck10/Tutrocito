/* ============================================================
   TUTROCITO FLIPBOOK ENGINE
   Clean canvas-based page flip. Images loaded via fetch.
   ============================================================ */

const cv  = document.getElementById('fc');
const ctx = cv.getContext('2d');
const A4  = 595.5 / 842.25; // page width/height ratio

let curL  = 0;   // left page index
let curR  = -1;  // right page index (-1 = none)
let PW    = 0;   // single page width in px
let PH    = 0;   // single page height in px
let busy  = false;
let zoomLv = 1.0;
let thumbsOpen = false;
let mobile = false;

/* ── Image cache ─────────────────────────────────────────── */
const IMGS = {};

function loadImg(i) {
  if (i < 0 || i >= TOTAL) return Promise.resolve(null);
  if (IMGS[i]) {
    if (IMGS[i].complete && IMGS[i].naturalWidth) return Promise.resolve(IMGS[i]);
    return new Promise(r => { IMGS[i].onload = () => r(IMGS[i]); IMGS[i].onerror = () => r(null); });
  }
  return new Promise(r => {
    const m = new Image();
    m.onload  = () => r(m);
    m.onerror = () => r(null);
    m.src = `pages/${String(i).padStart(2,'0')}.jpg`;
    IMGS[i] = m;
  });
}

function preload(...ids) {
  ids.filter(i => i >= 0 && i < TOTAL).forEach(i => loadImg(i));
}

/* ── Geometry ─────────────────────────────────────────────── */
function checkMobile() {
  mobile = window.innerWidth < 700;
}

function calcSize() {
  checkMobile();
  const stage = document.getElementById('stage');
  const aw = stage.offsetWidth  - (mobile ? 56 : 88);
  const ah = stage.offsetHeight - (mobile ? 8  : 12);
  const single = curR === -1 || mobile;

  let pW, pH;
  if (single) {
    pH = Math.min(ah, aw / A4);
    pW = pH * A4;
    if (pW > aw) { pW = aw; pH = pW / A4; }
  } else {
    pW = Math.min(aw / 2, ah * A4);
    pH = pW / A4;
    if (pH > ah) { pH = ah; pW = pH * A4; }
  }

  PW = Math.round(pW * zoomLv);
  PH = Math.round(pH * zoomLv);

  const tw = single ? PW : PW * 2;
  cv.width  = tw;
  cv.height = PH;

  const hl = document.getElementById('hl');
  hl.style.width  = tw + 'px';
  hl.style.height = PH + 'px';
}

function getSpread(idx) {
  idx = Math.max(0, Math.min(idx, TOTAL - 1));
  if (idx === 0 || mobile) return { l: idx, r: -1 };
  const l = idx % 2 === 1 ? idx : idx - 1;
  return { l, r: l + 1 < TOTAL ? l + 1 : -1 };
}

function setSpread(idx) {
  const s = getSpread(idx);
  curL = s.l;
  curR = s.r;
}

/* ── Static render ────────────────────────────────────────── */
async function render() {
  calcSize();
  ctx.clearRect(0, 0, cv.width, PH);

  const iL = await loadImg(curL);
  if (iL) ctx.drawImage(iL, 0, 0, PW, PH);

  const single = curR === -1 || mobile;
  if (!single && curR !== -1) {
    const iR = await loadImg(curR);
    if (iR) ctx.drawImage(iR, PW, 0, PW, PH);
    drawSpine();
  }

  buildHotspots();
  updateUI();
  updateHints();
  preload(curL - 1, curL + 1, curL + 2, curL + 3);
}

function drawSpine() {
  const g = ctx.createLinearGradient(PW - 16, 0, PW + 16, 0);
  g.addColorStop(0,    'rgba(0,0,0,0.28)');
  g.addColorStop(0.38, 'rgba(0,0,0,0.05)');
  g.addColorStop(0.5,  'rgba(255,255,255,0.05)');
  g.addColorStop(0.62, 'rgba(0,0,0,0.05)');
  g.addColorStop(1,    'rgba(0,0,0,0.28)');
  ctx.fillStyle = g;
  ctx.fillRect(PW - 16, 0, 32, PH);
}

/* ============================================================
   FLIP ANIMATION

   The page hinges at the spine and sweeps across.
   We render it with horizontal foreshortening (cos of angle)
   plus gradient shading to sell the 3D curl.

   Frame layers (back → front):
   1. Destination spread (full, revealed underneath)
   2. Static source page (stays flat)
   3. Turning page — foreshortened, shaded
   4. Shadow cast on static page
   5. Spine

   angle 0→π: front face (0→π/2) then back face (π/2→π)
   visW = |cos(angle)| * PW  — foreshortened width
   ============================================================ */

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

async function flipPage(dir) {
  if (busy) return;
  checkMobile();

  const srcL = curL;
  const srcR = mobile ? -1 : curR;
  const srcSingle = srcR === -1;

  // Destination
  let dstL, dstR;
  if (dir === 'next') {
    const last = srcSingle ? srcL : srcR;
    if (last >= TOTAL - 1) return;
    const d = getSpread(last + 1);
    dstL = d.l; dstR = mobile ? -1 : d.r;
  } else {
    if (srcL <= 0) return;
    const d = getSpread(srcL - 1);
    dstL = d.l; dstR = mobile ? -1 : d.r;
  }
  const dstSingle = dstR === -1;

  // Pages involved
  const flipIdx   = dir === 'next' ? (srcSingle ? srcL : srcR) : srcL;
  const staticIdx = dir === 'next' ? srcL : (srcSingle ? -1 : srcR);
  const backIdx   = dir === 'next' ? dstL : (dstR !== -1 ? dstR : dstL);

  busy = true;
  buildHotspots(); // clear during animation

  // Load all pages we need
  await Promise.all(
    [srcL, srcR, dstL, dstR, flipIdx, backIdx]
      .filter(i => i >= 0 && i < TOTAL)
      .map(i => loadImg(i))
  );

  calcSize();

  // Canvas wide enough for both spreads
  const tw = Math.max(srcSingle ? PW : PW * 2, dstSingle ? PW : PW * 2);
  cv.width = tw; cv.height = PH;
  document.getElementById('hl').style.width = tw + 'px';

  // The hinge x — the fixed edge the page rotates around
  // next → spine is left edge of the right-side page
  // prev → spine is right edge of the left-side page
  const spineX = dir === 'next'
    ? (srcSingle ? 0 : PW)
    : (srcSingle ? tw : PW);

  const DURATION = mobile ? 440 : 540;
  let t0 = null;

  const flipImg   = IMGS[flipIdx]  || null;
  const backImg   = IMGS[backIdx]  || null;
  const staticImg = staticIdx >= 0 ? (IMGS[staticIdx] || null) : null;
  const dstLImg   = IMGS[dstL]    || null;
  const dstRImg   = (dstR !== -1) ? (IMGS[dstR] || null) : null;

  function frame(ts) {
    if (!t0) t0 = ts;
    const raw = Math.min((ts - t0) / DURATION, 1);
    const t   = easeInOutCubic(raw);

    // angle: 0 (flat) → π (fully flipped)
    const angle = t * Math.PI;
    const cosA  = Math.cos(angle);
    const visW  = Math.abs(cosA) * PW;
    const front = cosA >= 0; // front face visible?

    ctx.clearRect(0, 0, tw, PH);

    /* 1 — Destination spread underneath */
    if (dstLImg?.complete) ctx.drawImage(dstLImg, 0, 0, PW, PH);
    if (dstRImg?.complete) ctx.drawImage(dstRImg, PW, 0, PW, PH);

    /* 2 — Static source page */
    if (staticImg?.complete) {
      const sx = dir === 'next' ? 0 : (srcSingle ? 0 : PW);
      ctx.drawImage(staticImg, sx, 0, PW, PH);
    }

    /* 3 — Turning page */
    if (visW > 0.5) {
      const drawImg = front ? flipImg : backImg;

      if (drawImg?.complete && drawImg.naturalWidth) {
        // destX: left edge of the compressed page on canvas
        // The spine edge is fixed; the free edge sweeps inward.
        // next: page anchored at spineX on its left, shrinks rightward
        //       so destX = spineX, right edge = spineX + visW
        //       But the right side of the page is the free edge, so:
        //       destX = spineX  (spine=left, free=right, page narrows from right)
        //       Actually: spineX is LEFT edge, full page goes spineX → spineX+PW.
        //       As it turns, it narrows toward spine, so destX stays at spineX.
        // prev: page anchored at spineX on its right, shrinks leftward
        //       destX = spineX - visW
        const destX = dir === 'next' ? spineX : spineX - visW;

        ctx.save();

        // Clip to the half where this page lives
        ctx.beginPath();
        if (dir === 'next') {
          ctx.rect(spineX, 0, tw - spineX, PH);
        } else {
          ctx.rect(0, 0, spineX, PH);
        }
        ctx.clip();

        // Subtle vertical scale at fold peak (paper bows slightly)
        const scaleY = 1.0 - Math.sin(angle) * 0.009;

        if (front) {
          ctx.save();
          ctx.translate(destX + visW / 2, PH / 2);
          ctx.scale(1, scaleY);
          ctx.translate(-(destX + visW / 2), -PH / 2);
          ctx.drawImage(drawImg, 0, 0, PW, PH, destX, 0, visW, PH);
          ctx.restore();
        } else {
          // Back face: mirrored horizontally
          ctx.save();
          ctx.translate(destX + visW / 2, PH / 2);
          ctx.scale(-1, scaleY);
          ctx.translate(-(destX + visW / 2), -PH / 2);
          ctx.drawImage(drawImg, 0, 0, PW, PH, destX, 0, visW, PH);
          ctx.restore();
        }

        /* Shading — darkens at fold peak, bright on flat parts */
        // sin(angle) peaks at 90° — that's the fold crease
        const foldIntensity = Math.sin(angle); // 0 → 1 → 0

        // front face: dark at spine edge, fades outward
        // back face:  dark at free edge, fades inward
        const shade = Math.pow(foldIntensity, 0.65) * (front ? 0.60 : 0.50);

        if (shade > 0.01) {
          const sg = ctx.createLinearGradient(destX, 0, destX + visW, 0);
          if (dir === 'next') {
            if (front) {
              // Spine (dark) on left → free edge on right
              sg.addColorStop(0,    `rgba(0,0,0,${shade})`);
              sg.addColorStop(0.5,  `rgba(0,0,0,${shade * 0.22})`);
              sg.addColorStop(1,    `rgba(0,0,0,0.01)`);
            } else {
              // Back face just past 90°: darkest at free edge (right)
              sg.addColorStop(0,    `rgba(0,0,0,0.01)`);
              sg.addColorStop(0.5,  `rgba(0,0,0,${shade * 0.22})`);
              sg.addColorStop(1,    `rgba(0,0,0,${shade})`);
            }
          } else {
            if (front) {
              // Spine (dark) on right → free edge on left
              sg.addColorStop(0,    `rgba(0,0,0,0.01)`);
              sg.addColorStop(0.5,  `rgba(0,0,0,${shade * 0.22})`);
              sg.addColorStop(1,    `rgba(0,0,0,${shade})`);
            } else {
              sg.addColorStop(0,    `rgba(0,0,0,${shade})`);
              sg.addColorStop(0.5,  `rgba(0,0,0,${shade * 0.22})`);
              sg.addColorStop(1,    `rgba(0,0,0,0.01)`);
            }
          }
          ctx.fillStyle = sg;
          ctx.fillRect(destX, 0, visW, PH);
        }

        /* Specular crease highlight at the fold line */
        const spec = Math.exp(-Math.pow((angle - Math.PI / 2) * 5.5, 2)) * 0.15;
        if (spec > 0.004) {
          const cw  = Math.max(3, visW * 0.06);
          const cx2 = dir === 'next' ? destX : destX + visW - cw;
          const cg  = ctx.createLinearGradient(cx2, 0, cx2 + cw, 0);
          cg.addColorStop(0,   'rgba(255,255,255,0)');
          cg.addColorStop(0.5, `rgba(255,255,255,${spec})`);
          cg.addColorStop(1,   'rgba(255,255,255,0)');
          ctx.fillStyle = cg;
          ctx.fillRect(cx2, 0, cw, PH);
        }

        ctx.restore();
      }
    }

    /* 4 — Shadow cast on static page */
    if (staticIdx >= 0) {
      // Peak at midpoint of the real elapsed time
      const peak  = Math.sin(raw * Math.PI);
      const alpha = peak * 0.26;
      if (alpha > 0.005) {
        const sw  = PW * 0.5;
        const sx2 = dir === 'next' ? 0 : (srcSingle ? 0 : PW);
        const sg2 = ctx.createLinearGradient(
          dir === 'next' ? sx2 + sw : sx2,          0,
          dir === 'next' ? sx2      : sx2 + sw,      0
        );
        sg2.addColorStop(0,   'rgba(0,0,0,0.01)');
        sg2.addColorStop(0.4, `rgba(0,0,0,${alpha * 0.5})`);
        sg2.addColorStop(1,   `rgba(0,0,0,${alpha})`);
        ctx.fillStyle = sg2;
        ctx.fillRect(sx2, 0, sw, PH);
      }
    }

    /* 5 — Spine */
    if (!srcSingle || !dstSingle) drawSpine();

    /* Done? */
    if (raw < 1) {
      requestAnimationFrame(frame);
    } else {
      curL = dstL;
      curR = dstR;
      render();
      busy = false;
    }
  }

  requestAnimationFrame(frame);
}

/* ── Corner drag ──────────────────────────────────────────── */
let drag = null;
const CORNER = 78;

function getCornerDir(cx, cy) {
  const last = (!mobile && curR !== -1) ? curR : curL;
  const w    = cv.width;
  const inTop    = cy < CORNER;
  const inBottom = cy > PH - CORNER;
  if (cx > w - CORNER && (inTop || inBottom) && last < TOTAL - 1) return 'next';
  if (cx < CORNER     && (inTop || inBottom) && curL > 0)          return 'prev';
  return null;
}

function canvasPos(e) {
  const r = cv.getBoundingClientRect();
  const s = e.touches ? e.touches[0] : e;
  return { x: s.clientX - r.left, y: s.clientY - r.top };
}

cv.addEventListener('mousedown', e => {
  if (busy) return;
  const p = canvasPos(e), d = getCornerDir(p.x, p.y);
  if (!d) return;
  drag = { dir: d, sx: p.x, cx: p.x };
  cv.style.cursor = 'grabbing';
});
cv.addEventListener('touchstart', e => {
  if (busy) return;
  const p = canvasPos(e), d = getCornerDir(p.x, p.y);
  if (!d) return;
  drag = { dir: d, sx: p.x, cx: p.x };
  e.preventDefault();
}, { passive: false });

window.addEventListener('mousemove', e => {
  if (drag) { drag.cx = canvasPos(e).x; return; }
  const p = canvasPos(e);
  cv.style.cursor = getCornerDir(p.x, p.y) ? 'grab' : 'default';
});
window.addEventListener('touchmove', e => {
  if (!drag) return;
  drag.cx = canvasPos(e).x;
  e.preventDefault();
}, { passive: false });

function endDrag() {
  if (!drag) return;
  const moved = drag.dir === 'next' ? drag.sx - drag.cx : drag.cx - drag.sx;
  cv.style.cursor = 'default';
  if (moved > 22) flipPage(drag.dir);
  drag = null;
}
window.addEventListener('mouseup',  endDrag);
window.addEventListener('touchend', endDrag);

/* ── Swipe ────────────────────────────────────────────────── */
let swX = 0, swY = 0;
cv.addEventListener('touchstart', e => {
  swX = e.touches[0].clientX;
  swY = e.touches[0].clientY;
}, { passive: true });
cv.addEventListener('touchend', e => {
  if (drag) return;
  const dx = e.changedTouches[0].clientX - swX;
  const dy = e.changedTouches[0].clientY - swY;
  if (Math.abs(dx) > Math.abs(dy) * 1.1 && Math.abs(dx) > 42)
    flipPage(dx < 0 ? 'next' : 'prev');
}, { passive: true });

/* ── Hotspots ─────────────────────────────────────────────── */
function buildHotspots() {
  const hl = document.getElementById('hl');
  hl.innerHTML = '';
  if (busy) return;

  const add = (pageIdx, offsetX) => {
    (LINKS[pageIdx] || []).forEach(lk => {
      const a       = document.createElement('a');
      a.className   = 'hs';
      a.href        = lk.uri;
      a.target      = '_blank';
      a.rel         = 'noopener noreferrer';
      a.style.left   = (offsetX + lk.x * PW) + 'px';
      a.style.top    = (lk.y * PH) + 'px';
      a.style.width  = (lk.w * PW) + 'px';
      a.style.height = (lk.h * PH) + 'px';
      hl.appendChild(a);
    });
  };

  add(curL, 0);
  if (!mobile && curR !== -1) add(curR, PW);
}

/* ── Corner hints ─────────────────────────────────────────── */
function updateHints() {
  const last = (!mobile && curR !== -1) ? curR : curL;
  document.getElementById('hR').className = 'ch br' + (last < TOTAL - 1 ? ' on' : '');
  document.getElementById('hL').className = 'ch bl' + (curL > 0 ? ' on' : '');
}

/* ── UI ───────────────────────────────────────────────────── */
function updateUI() {
  const last = (!mobile && curR !== -1) ? curR : curL;

  let pg = `<b>${curL + 1}</b>`;
  if (!mobile && curR !== -1) pg += `–<b>${curR + 1}</b>`;
  pg += `<span> / ${TOTAL}</span>`;
  document.getElementById('pgc').innerHTML = pg;

  document.getElementById('btnP').disabled = curL <= 0;
  document.getElementById('btnN').disabled = last >= TOTAL - 1;

  document.querySelectorAll('.th').forEach((el, i) =>
    el.classList.toggle('on', i === curL || (!mobile && i === curR))
  );
}

/* ── Thumbnails ───────────────────────────────────────────── */
function buildThumbs() {
  const strip = document.getElementById('thumbs');
  for (let i = 0; i < TOTAL; i++) {
    const d = document.createElement('div');
    d.className   = 'th';
    d.dataset.idx = String(i);
    d.title       = `Página ${i + 1}`;
    d.onclick = () => {
      checkMobile();
      setSpread(i);
      render();
      if (thumbsOpen) toggleThumbs();
    };
    const m   = document.createElement('img');
    m.loading = 'lazy';
    m.alt     = `Pág ${i + 1}`;
    m.src     = `pages/${String(i).padStart(2, '0')}.jpg`;
    d.appendChild(m);
    strip.appendChild(d);
  }
}

function toggleThumbs() {
  thumbsOpen = !thumbsOpen;
  document.getElementById('thumbs').classList.toggle('open', thumbsOpen);
}

/* ── Zoom ─────────────────────────────────────────────────── */
function setZoom(v) {
  zoomLv = Math.max(0.4, Math.min(1.9, v));
  if (!busy) render();
}

/* ── Zoom overlay ─────────────────────────────────────────── */
cv.addEventListener('dblclick', e => {
  const p   = canvasPos(e);
  const idx = (!mobile && curR !== -1 && p.x > PW) ? curR : curL;
  const src = `pages/${String(idx).padStart(2, '0')}.jpg`;
  document.getElementById('zimg').src = src;
  document.getElementById('zov').classList.add('on');
});

window.closeZoom = () => document.getElementById('zov').classList.remove('on');

/* ── Keyboard ─────────────────────────────────────────────── */
document.addEventListener('keydown', e => {
  if (['ArrowRight', ' '].includes(e.key)) { e.preventDefault(); flipPage('next'); }
  if (e.key === 'ArrowLeft')               { e.preventDefault(); flipPage('prev'); }
  if (e.key === 'Escape')                    closeZoom();
  if (e.key === '+' || e.key === '=')        setZoom(zoomLv + 0.12);
  if (e.key === '-')                         setZoom(zoomLv - 0.12);
});

/* ── Controls ─────────────────────────────────────────────── */
document.getElementById('btnP').onclick  = () => flipPage('prev');
document.getElementById('btnN').onclick  = () => flipPage('next');
document.getElementById('btnTh').onclick = toggleThumbs;
document.getElementById('zIn').onclick   = () => setZoom(zoomLv + 0.12);
document.getElementById('zOut').onclick  = () => setZoom(zoomLv - 0.12);

document.getElementById('btnFS').onclick = () => {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
  else document.exitFullscreen?.();
};
document.addEventListener('fullscreenchange', () => { if (!busy) render(); });

window.addEventListener('resize', () => {
  if (busy) return;
  const wasMobile = mobile;
  checkMobile();
  if (wasMobile !== mobile) setSpread(curL);
  render();
});

/* ── Init ─────────────────────────────────────────────────── */
async function init() {
  checkMobile();
  setSpread(0);
  buildThumbs();

  // Load first 4 pages immediately
  await Promise.all([0, 1, 2, 3].map(i => loadImg(i)));

  await render();

  // Dismiss loading screen
  const ld = document.getElementById('loading');
  ld.style.opacity = '0';
  ld.style.pointerEvents = 'none';
  setTimeout(() => ld.remove(), 650);

  // One-time tooltip
  setTimeout(() => {
    const tip = document.getElementById('tip');
    tip.classList.add('on');
    setTimeout(() => tip.classList.remove('on'), 5000);
  }, 800);

  // Pre-load rest in background
  for (let i = 4; i < TOTAL; i++) {
    await loadImg(i);
    const bar = document.getElementById('prebar');
    if (bar) bar.style.width = ((i + 1) / TOTAL * 100) + '%';
  }
  const prebg = document.getElementById('prebg');
  if (prebg) prebg.style.opacity = '0';
}

init();
