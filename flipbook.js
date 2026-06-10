/* ============================================================
   TUTROCITO FLIPBOOK — CSS 3D rotateY engine
   
   El navegador hace la perspectiva nativa. Sin canvas bugs.
   60fps garantizado. El flip es un card con dos caras que 
   rota en Y con transform-origin en el lomo.
   ============================================================ */
'use strict';

const A4 = 595.5 / 842.25;

// ── State ───────────────────────────────────────────────────
let curL    = 0;
let curR    = -1;
let PW      = 0;    // single page width px
let PH      = 0;    // single page height px
let busy    = false;
let zoomLv  = 1;
let thumbsOpen = false;
let mob     = false;

// ── Image preloader ─────────────────────────────────────────
const IMG_CACHE = {};
function imgSrc(i) { return `pages/${String(i).padStart(2,'0')}.jpg`; }

function loadImg(i) {
  if (i < 0 || i >= TOTAL) return Promise.resolve(null);
  if (IMG_CACHE[i]) {
    const m = IMG_CACHE[i];
    if (m.complete && m.naturalWidth) return Promise.resolve(m);
    return new Promise(r => m.addEventListener('load', () => r(m), { once: true }));
  }
  return new Promise(r => {
    const m   = new Image();
    m.onload  = () => r(m);
    m.onerror = () => r(null);
    m.src     = imgSrc(i);
    IMG_CACHE[i] = m;
  });
}

function preload(...ids) {
  ids.filter(i => i >= 0 && i < TOTAL).forEach(i => loadImg(i));
}

// ── Elements ────────────────────────────────────────────────
const elScene      = document.getElementById('scene');
const elBook       = document.getElementById('book');
const elStaticL    = document.getElementById('pageStaticL');
const elStaticR    = document.getElementById('pageStaticR');
const elFlipper    = document.getElementById('flipper');
const elFlipFront  = document.getElementById('imgFlipFront');
const elFlipBack   = document.getElementById('imgFlipBack');
const elImgL       = document.getElementById('imgStaticL');
const elImgR       = document.getElementById('imgStaticR');
const elHsL        = document.getElementById('hsL');
const elHsR        = document.getElementById('hsR');
const elPeelR      = document.getElementById('peelR');
const elPeelL      = document.getElementById('peelL');

// ── Layout ──────────────────────────────────────────────────
function checkMob() { mob = window.innerWidth < 700; }

function layout() {
  checkMob();
  const stage = document.getElementById('stage');
  const aw = stage.offsetWidth  - (mob ? 52 : 88);
  const ah = stage.offsetHeight - 12;
  const single = curR === -1 || mob;

  let pw, ph;
  if (single) {
    ph = Math.min(ah, aw / A4); pw = ph * A4;
    if (pw > aw) { pw = aw; ph = pw / A4; }
  } else {
    pw = Math.min(aw / 2, ah * A4); ph = pw / A4;
    if (ph > ah) { ph = ah; pw = ph * A4; }
  }

  PW = Math.round(pw * zoomLv);
  PH = Math.round(ph * zoomLv);

  // Size the page panels
  const pageStyle = `width:${PW}px;height:${PH}px;`;
  elStaticL.style.cssText += pageStyle;
  elStaticR.style.cssText += pageStyle;
  elFlipper.style.cssText += pageStyle;

  // Book total width
  const bookW = single ? PW : PW * 2;
  elBook.style.width  = bookW + 'px';
  elBook.style.height = PH + 'px';

  // Spine shadow
  const spine = elBook.querySelector('.spine-shadow');
  if (single) {
    spine.style.display = 'none';
  } else {
    spine.style.cssText = `
      display:block;
      position:absolute; top:0; bottom:0;
      left:${PW - 14}px; width:28px;
      background: linear-gradient(to right,
        rgba(0,0,0,.25) 0%, rgba(0,0,0,.04) 35%,
        rgba(255,255,255,.04) 50%,
        rgba(0,0,0,.04) 65%, rgba(0,0,0,.25) 100%);
      pointer-events:none; z-index:10;
    `;
  }

  // Book shadow (floor shadow)
  const bsh = elBook.parentElement.querySelector('.book-shadow');
  if (bsh) bsh.style.width = bookW * 0.9 + 'px';
}

function getSpread(idx) {
  idx = Math.max(0, Math.min(idx, TOTAL - 1));
  if (idx === 0 || mob) return { l: idx, r: -1 };
  const l = idx % 2 === 1 ? idx : idx - 1;
  return { l, r: l + 1 < TOTAL ? l + 1 : -1 };
}

function setSpread(idx) {
  const s = getSpread(idx);
  curL = s.l; curR = s.r;
}

// ── Render static spread ────────────────────────────────────
async function render() {
  layout();
  checkMob();

  const single = curR === -1 || mob;

  // Left page
  elImgL.src = imgSrc(curL);
  elStaticL.style.display = 'block';
  elStaticL.className = 'page-static left' + (single ? ' single' : '');

  // Right page
  if (!single && curR !== -1) {
    elImgR.src = imgSrc(curR);
    elStaticR.style.display = 'block';
    elStaticR.className = 'page-static right';
    // Position right page
    elStaticR.style.position = 'absolute';
    elStaticR.style.left = PW + 'px';
    elStaticR.style.top  = '0';
  } else {
    elStaticR.style.display = 'none';
  }

  // Hide flipper when static
  elFlipper.style.display = 'none';
  elFlipper.style.transform = '';

  buildHotspots();
  updateUI();
  updatePeelHints();
  preload(curL - 1, curL + 1, curL + 2, curL + 3);
}

// ── CSS 3D Page Flip ────────────────────────────────────────
//
// Technique:
//   The .flipper div is positioned on top of the static page that turns.
//   It has two faces: front (the page that turns) and back (destination page).
//   We animate rotateY from 0° to -180° (next) or 0° to 180° (prev).
//   transform-origin is set to the spine edge so it rotates around the correct axis.
//   The static destination pages are revealed underneath as the flipper rotates.
//   Gradient overlays on each face simulate lighting/shading.
//
//   Easing: cubic-bezier(0.645, 0.045, 0.355, 1.000) — smooth start, smooth end
//

async function flipPage(dir) {
  if (busy) return;
  checkMob();

  const srcL = curL, srcR = mob ? -1 : curR;
  const srcSingle = srcR === -1;

  let dstL, dstR;
  if (dir === 'next') {
    const last = srcSingle ? srcL : srcR;
    if (last >= TOTAL - 1) return;
    const d = getSpread(last + 1);
    dstL = d.l; dstR = mob ? -1 : d.r;
  } else {
    if (srcL <= 0) return;
    const d = getSpread(srcL - 1);
    dstL = d.l; dstR = mob ? -1 : d.r;
  }
  const dstSingle = dstR === -1;

  // Which page flips, which stays static, what's on the back
  const flipIdx   = dir === 'next' ? (srcSingle ? srcL : srcR) : srcL;
  const staticIdx = dir === 'next' ? srcL : (srcSingle ? -1 : srcR);
  const backIdx   = dir === 'next' ? dstL : (dstR !== -1 ? dstR : dstL);

  busy = true;
  clearHotspots();

  // Pre-load flip + back images
  await Promise.all([flipIdx, backIdx, dstL, dstR]
    .filter(i => i >= 0 && i < TOTAL)
    .map(loadImg));

  layout();

  // ── Set up the scene for this flip ──────────────────────────

  // Static layer: show destination spread underneath
  // Left static: src left page OR dst left page depending on direction
  if (dir === 'next') {
    // Under the flip: show dst left (left side)
    // Static right stays as src left (it's on the left and doesn't move)
    elImgL.src = imgSrc(srcSingle ? dstL : srcL);
    elStaticL.style.display = 'block';
    elStaticL.className = 'page-static left';

    if (!dstSingle && dstR !== -1) {
      elImgR.src = imgSrc(dstR);
      elStaticR.style.display = 'block';
      elStaticR.className = 'page-static right';
      elStaticR.style.position = 'absolute';
      elStaticR.style.left = PW + 'px';
      elStaticR.style.top  = '0';
    } else if (!srcSingle) {
      // show dst left on right side (dst is single)
      elImgR.src = imgSrc(dstL);
      elStaticR.style.display = 'block';
    } else {
      elStaticR.style.display = 'none';
    }
  } else {
    // prev
    elImgL.src = imgSrc(dstL);
    elStaticL.style.display = 'block';
    elStaticL.className = 'page-static left';

    if (!dstSingle && dstR !== -1) {
      elImgR.src = imgSrc(dstR);
      elStaticR.style.display = 'block';
      elStaticR.style.position = 'absolute';
      elStaticR.style.left = PW + 'px';
      elStaticR.style.top  = '0';
    } else {
      elStaticR.style.display = 'none';
    }
  }

  // ── Position and set up the flipper ────────────────────────
  elFlipFront.src = imgSrc(flipIdx);
  elFlipBack.src  = imgSrc(backIdx);

  // Flipper position: on top of the page that's turning
  elFlipper.style.display   = 'block';
  elFlipper.style.position  = 'absolute';
  elFlipper.style.top       = '0';
  elFlipper.style.width     = PW + 'px';
  elFlipper.style.height    = PH + 'px';

  if (dir === 'next') {
    // Flipper covers the right-hand page (or only page if single)
    elFlipper.style.left         = (srcSingle ? '0' : PW) + 'px';
    elFlipper.style.transformOrigin = 'left center';
    elFlipper.style.transform    = 'rotateY(0deg)';
  } else {
    // Flipper covers the left-hand page
    elFlipper.style.left         = '0px';
    elFlipper.style.transformOrigin = 'right center';
    elFlipper.style.transform    = 'rotateY(0deg)';
  }

  // Remove any previous transition so we can set start position
  elFlipper.style.transition = 'none';

  // Shadow overlays on front/back faces
  const frontEl = elFlipper.querySelector('.flipper-front');
  const backEl  = elFlipper.querySelector('.flipper-back');

  // Reset shading
  frontEl.style.removeProperty('--shade');
  backEl.style.removeProperty('--shade');

  // Force layout reflow so transition applies
  elFlipper.getBoundingClientRect();

  // ── Animate ─────────────────────────────────────────────────
  const DURATION = mob ? 440 : 540; // ms

  // We use Web Animations API for precise control over the 3D rotation
  const endAngle = dir === 'next' ? -180 : 180;

  // Custom easing: ease-in-out with slight overshoot feel
  const easing = 'cubic-bezier(0.645, 0.045, 0.355, 1.000)';

  const anim = elFlipper.animate(
    [
      { transform: 'rotateY(0deg)' },
      { transform: `rotateY(${endAngle}deg)` }
    ],
    {
      duration:   DURATION,
      easing:     easing,
      fill:       'forwards'
    }
  );

  // ── Shading animation (runs parallel, manual rAF) ───────────
  // We animate gradient overlays to sell the 3D lighting.
  // Front face: darkens as it approaches 90°, then disappears.
  // Back face: bright at 90° (just revealed), darkens as it flattens.

  const startTime   = performance.now();
  let shadingActive = true;

  function shadeFrame(now) {
    if (!shadingActive) return;
    const raw = Math.min((now - startTime) / DURATION, 1);
    // angle in radians: 0 → π
    const angle  = raw * Math.PI;
    const cosA   = Math.cos(angle);
    const sinA   = Math.sin(angle);
    const front  = cosA >= 0;

    // Shading intensity peaks at 90°
    const shade  = sinA * (front ? 0.55 : 0.45);

    if (front) {
      // Front darkens toward the fold (spine side)
      if (dir === 'next') {
        frontEl.style.background =
          `linear-gradient(to right, rgba(0,0,0,${shade}) 0%, rgba(0,0,0,${shade*0.15}) 50%, rgba(0,0,0,0) 100%)`;
      } else {
        frontEl.style.background =
          `linear-gradient(to left, rgba(0,0,0,${shade}) 0%, rgba(0,0,0,${shade*0.15}) 50%, rgba(0,0,0,0) 100%)`;
      }
      backEl.style.background = 'none';
    } else {
      // Back face: bright near fold, darkens toward outer edge
      const backShade = shade;
      if (dir === 'next') {
        backEl.style.background =
          `linear-gradient(to right, rgba(0,0,0,0) 0%, rgba(0,0,0,${backShade*0.2}) 50%, rgba(0,0,0,${backShade}) 100%)`;
      } else {
        backEl.style.background =
          `linear-gradient(to left, rgba(0,0,0,0) 0%, rgba(0,0,0,${backShade*0.2}) 50%, rgba(0,0,0,${backShade}) 100%)`;
      }
      frontEl.style.background = 'none';
    }

    // Specular highlight at the crease (peaks at exactly 90°)
    const spec = Math.exp(-Math.pow((angle - Math.PI / 2) * 6, 2)) * 0.22;
    if (front && spec > 0.005) {
      const side = dir === 'next' ? 'left' : 'right';
      const w    = Math.max(3, PW * 0.04);
      frontEl.style.boxShadow = `inset ${dir === 'next' ? `-${w}px` : `${w}px`} 0 ${w}px rgba(255,255,255,${spec})`;
    } else {
      frontEl.style.boxShadow = 'none';
      backEl.style.boxShadow  = 'none';
    }

    if (raw < 1) {
      requestAnimationFrame(shadeFrame);
    }
  }
  requestAnimationFrame(shadeFrame);

  // ── On animation end ─────────────────────────────────────────
  anim.addEventListener('finish', () => {
    shadingActive = false;
    frontEl.style.background = 'none';
    backEl.style.background  = 'none';
    frontEl.style.boxShadow  = 'none';
    backEl.style.boxShadow   = 'none';

    curL = dstL;
    curR = dstR;
    render();
    busy = false;
  });
}

// ── Drag from corner ─────────────────────────────────────────
let drag = null;
const CORNER = 80;

function cornerDir(x, y, w) {
  const last = (!mob && curR !== -1) ? curR : curL;
  const nearEdge = y < CORNER || y > PH - CORNER;
  if (x > w - CORNER && nearEdge && last < TOTAL - 1) return 'next';
  if (x < CORNER     && nearEdge && curL > 0)          return 'prev';
  return null;
}

function bookPos(e) {
  const r = elBook.getBoundingClientRect();
  const s = e.touches ? e.touches[0] : e;
  return { x: s.clientX - r.left, y: s.clientY - r.top };
}

elBook.addEventListener('mousedown', e => {
  if (busy) return;
  const p = bookPos(e), d = cornerDir(p.x, p.y, elBook.offsetWidth);
  if (!d) return;
  drag = { dir: d, sx: p.x, cx: p.x };
  elBook.style.cursor = 'grabbing';
  e.preventDefault();
}, { passive: false });

elBook.addEventListener('touchstart', e => {
  if (busy) return;
  const p = bookPos(e), d = cornerDir(p.x, p.y, elBook.offsetWidth);
  if (!d) return;
  drag = { dir: d, sx: p.x, cx: p.x };
  e.preventDefault();
}, { passive: false });

window.addEventListener('mousemove', e => {
  if (drag) { drag.cx = bookPos(e).x; return; }
  const p = bookPos(e);
  elBook.style.cursor = cornerDir(p.x, p.y, elBook.offsetWidth) ? 'grab' : 'default';
});

window.addEventListener('touchmove', e => {
  if (!drag) return;
  drag.cx = bookPos(e).x;
  e.preventDefault();
}, { passive: false });

function endDrag() {
  if (!drag) return;
  const moved = drag.dir === 'next' ? drag.sx - drag.cx : drag.cx - drag.sx;
  elBook.style.cursor = 'default';
  if (moved > 22) flipPage(drag.dir);
  drag = null;
}
window.addEventListener('mouseup',  endDrag);
window.addEventListener('touchend', endDrag);

// Swipe on mobile
let swX = 0, swY = 0;
document.addEventListener('touchstart', e => {
  swX = e.touches[0].clientX; swY = e.touches[0].clientY;
}, { passive: true });
document.addEventListener('touchend', e => {
  if (drag) return;
  const dx = e.changedTouches[0].clientX - swX;
  const dy = e.changedTouches[0].clientY - swY;
  if (Math.abs(dx) > Math.abs(dy) * 1.2 && Math.abs(dx) > 44) {
    flipPage(dx < 0 ? 'next' : 'prev');
  }
}, { passive: true });

// ── Hotspots ─────────────────────────────────────────────────
function clearHotspots() { elHsL.innerHTML = ''; elHsR.innerHTML = ''; }

function buildHotspots() {
  clearHotspots();
  if (busy) return;

  const add = (pi, container) => {
    (LINKS[pi] || []).forEach(lk => {
      const a = document.createElement('a');
      a.className = 'hs';
      a.href      = lk.uri;
      a.target    = '_blank';
      a.rel       = 'noopener noreferrer';
      a.style.left   = (lk.x * 100) + '%';
      a.style.top    = (lk.y * 100) + '%';
      a.style.width  = (lk.w * 100) + '%';
      a.style.height = (lk.h * 100) + '%';
      container.appendChild(a);
    });
  };

  add(curL, elHsL);
  if (!mob && curR !== -1) add(curR, elHsR);
}

// ── Peel hints ───────────────────────────────────────────────
function updatePeelHints() {
  const last = (!mob && curR !== -1) ? curR : curL;
  const showR = last < TOTAL - 1;
  const showL = curL > 0;

  if (showR && !elPeelR.innerHTML) {
    elPeelR.innerHTML = `<svg viewBox="0 0 56 56" fill="none" width="56" height="56">
      <defs><radialGradient id="pg1" cx="100%" cy="100%" r="100%">
        <stop offset="0%" stop-color="#F24660" stop-opacity=".9"/>
        <stop offset="80%" stop-color="#F24660" stop-opacity="0"/>
      </radialGradient></defs>
      <path d="M56 56 L14 56 Q4 56 4 46 L4 4" stroke="url(#pg1)" stroke-width="1.8"
            stroke-dasharray="4 3.5" fill="none" stroke-linecap="round"/>
      <polygon points="35,56 56,56 56,35" fill="rgba(242,70,96,.18)"/>
      <circle cx="49" cy="49" r="3.5" fill="rgba(242,70,96,.85)"/>
      <circle cx="49" cy="49" r="6"   fill="rgba(242,70,96,.14)"/>
    </svg>`;
  }
  if (showL && !elPeelL.innerHTML) {
    elPeelL.innerHTML = `<svg viewBox="0 0 56 56" fill="none" width="56" height="56">
      <defs><radialGradient id="pg2" cx="0%" cy="100%" r="100%">
        <stop offset="0%" stop-color="#F24660" stop-opacity=".9"/>
        <stop offset="80%" stop-color="#F24660" stop-opacity="0"/>
      </radialGradient></defs>
      <path d="M0 56 L42 56 Q52 56 52 46 L52 4" stroke="url(#pg2)" stroke-width="1.8"
            stroke-dasharray="4 3.5" fill="none" stroke-linecap="round"/>
      <polygon points="21,56 0,56 0,35" fill="rgba(242,70,96,.18)"/>
      <circle cx="7" cy="49" r="3.5" fill="rgba(242,70,96,.85)"/>
      <circle cx="7" cy="49" r="6"   fill="rgba(242,70,96,.14)"/>
    </svg>`;
  }

  elPeelR.className = 'peel-hint right' + (showR ? ' show' : '');
  elPeelL.className = 'peel-hint left'  + (showL ? ' show' : '');
}

// ── UI ────────────────────────────────────────────────────────
function updateUI() {
  const last = (!mob && curR !== -1) ? curR : curL;
  const lbl = document.getElementById('pageLabel');
  if (lbl) {
    let t = `<b>${curL + 1}</b>`;
    if (!mob && curR !== -1) t += `–<b>${curR + 1}</b>`;
    t += `&thinsp;/&thinsp;${TOTAL}`;
    lbl.innerHTML = t;
  }
  document.getElementById('btnPrev').disabled = curL <= 0;
  document.getElementById('btnNext').disabled = last >= TOTAL - 1;
  document.querySelectorAll('.th').forEach((el, i) =>
    el.classList.toggle('on', i === curL || (!mob && i === curR))
  );
}

// ── Thumbnails ────────────────────────────────────────────────
function buildThumbs() {
  const strip = document.getElementById('thumbstrip');
  for (let i = 0; i < TOTAL; i++) {
    const d = document.createElement('div');
    d.className   = 'th';
    d.dataset.idx = i;
    d.title       = `Página ${i + 1}`;
    d.onclick = () => {
      checkMob();
      setSpread(i);
      render();
      if (thumbsOpen) toggleThumbs();
    };
    const m = document.createElement('img');
    m.loading = 'lazy';
    m.alt     = `Pág ${i + 1}`;
    m.src     = imgSrc(i);
    d.appendChild(m);
    strip.appendChild(d);
  }
}

function toggleThumbs() {
  thumbsOpen = !thumbsOpen;
  document.getElementById('thumbstrip').classList.toggle('open', thumbsOpen);
}

// ── Zoom ─────────────────────────────────────────────────────
function setZoom(v) {
  zoomLv = Math.max(0.4, Math.min(1.9, v));
  if (!busy) render();
}

// ── Zoom overlay ──────────────────────────────────────────────
elBook.addEventListener('dblclick', e => {
  const p   = bookPos(e);
  const idx = (!mob && curR !== -1 && p.x > PW) ? curR : curL;
  document.getElementById('zoomImg').src = imgSrc(idx);
  document.getElementById('zoomOverlay').classList.add('on');
});
window.closeZoom = () => document.getElementById('zoomOverlay').classList.remove('on');

// ── Keyboard ─────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (['ArrowRight', ' '].includes(e.key)) { e.preventDefault(); flipPage('next'); }
  if (e.key === 'ArrowLeft')               { e.preventDefault(); flipPage('prev'); }
  if (e.key === 'Escape')                    closeZoom();
  if (e.key === '+' || e.key === '=')        setZoom(zoomLv + 0.12);
  if (e.key === '-')                         setZoom(zoomLv - 0.12);
});

// ── Controls ──────────────────────────────────────────────────
document.getElementById('btnPrev').onclick   = () => flipPage('prev');
document.getElementById('btnNext').onclick   = () => flipPage('next');
document.getElementById('btnThumbs').onclick = toggleThumbs;
document.getElementById('zIn').onclick       = () => setZoom(zoomLv + 0.12);
document.getElementById('zOut').onclick      = () => setZoom(zoomLv - 0.12);
document.getElementById('btnFS').onclick     = () => {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
  else document.exitFullscreen?.();
};
document.addEventListener('fullscreenchange', () => { if (!busy) render(); });
window.addEventListener('resize', () => {
  if (busy) return;
  const was = mob; checkMob();
  if (was !== mob) setSpread(curL);
  render();
});

// ── Init ──────────────────────────────────────────────────────
(async () => {
  checkMob();
  setSpread(0);
  buildThumbs();

  // Load first pages
  await Promise.all([0, 1, 2, 3].map(i => loadImg(i)));
  await render();

  // Hide loading
  const ld = document.getElementById('loading');
  const fill = document.getElementById('ldFill');
  if (fill) fill.style.width = '100%';
  setTimeout(() => {
    ld.style.opacity = '0';
    ld.style.pointerEvents = 'none';
    setTimeout(() => ld.remove(), 650);
  }, 200);

  // Tooltip
  setTimeout(() => {
    const tip = document.getElementById('tooltip');
    if (tip) { tip.classList.add('on'); setTimeout(() => tip.classList.remove('on'), 5000); }
  }, 900);

  // Load rest in background
  for (let i = 4; i < TOTAL; i++) {
    await loadImg(i);
  }
})();
