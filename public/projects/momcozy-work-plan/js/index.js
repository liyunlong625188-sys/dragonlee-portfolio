const pageParams = new URLSearchParams(window.location.search);
const forceShader = pageParams.has('shader');
const isOfflineFileMode = window.location.protocol === 'file:' || window.__WORKPLAN_FORCE_FILE_MODE__ === true;
const shouldSkipLongIntro = !!sessionStorage.getItem('index-return-fade') && !pageParams.has('intro');
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const mustSkip = shouldSkipLongIntro || prefersReducedMotion;

if (history.scrollRestoration) {
  history.scrollRestoration = mustSkip ? 'auto' : 'manual';
}

const isMobile = navigator.maxTouchPoints > 1;
const isSlowHardware = isMobile || (navigator.hardwareConcurrency || 8) <= 4;
// Keep the red hero motion on refresh; only skip it for reduced-motion users or slower devices.
const shouldRunHeroShader = forceShader || (!isSlowHardware && !prefersReducedMotion);

let lastMouseX = window.innerWidth / 2;
let lastMouseY = window.innerHeight / 2;
window.addEventListener('mousemove', (e) => {
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;
}, { passive: true });

let _isForcingScroll = false;
function _forceScrollTop() {
  if (_isForcingScroll) return;
  _isForcingScroll = true;
  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
  _isForcingScroll = false;
}

function _preventTouchScroll(e) { e.preventDefault(); }

function _lockMobileScroll() {
  document.addEventListener('touchmove', _preventTouchScroll, { passive: false });
  window.addEventListener('scroll', _forceScrollTop);
}

function _unlockMobileScroll() {
  document.removeEventListener('touchmove', _preventTouchScroll);
  window.removeEventListener('scroll', _forceScrollTop);
}

if (!mustSkip) {
  _forceScrollTop();
  window.addEventListener('scroll', _forceScrollTop);
  
  if (isMobile) {
    document.addEventListener('touchmove', _preventTouchScroll, { passive: false });
  } else {
    document.documentElement.style.overflow = 'hidden';
  }

  requestAnimationFrame(() => _forceScrollTop());
  window.addEventListener('load', () => {
    _forceScrollTop();
  }, { once: true });
}

let _shaderStarted = false;
function loadScriptOnce(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === 'true') resolve();
      else existing.addEventListener('load', resolve, { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = false;
    script.onload = () => {
      script.dataset.loaded = 'true';
      resolve();
    };
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

async function startShader() {
  if (_shaderStarted) return;
  _shaderStarted = true;

  const container = document.getElementById('hero-canvas');
  if (!container) return;

  const offlineAssets = window.__WORKPLAN_OFFLINE_ASSETS__;
  if (isOfflineFileMode && offlineAssets?.shaderBackground) {
    container.style.backgroundImage = `url("${offlineAssets.shaderBackground}")`;
  }

  if (!shouldRunHeroShader) {
    container.classList.add('is-static');
    return;
  }

  if (!window.CoreRenderer) await loadScriptOnce('js/core-renderer.js');
  if (!window._heroProjectData) await loadScriptOnce('js/hero-project.js');

  const projectData = window._heroProjectData;
  if (!projectData) {
    console.error('Hero project data not found!');
    container.classList.add('is-static');
    return;
  }

  if (isOfflineFileMode && offlineAssets?.shaderBackground) {
    const imageLayer = projectData.layers?.find(layer =>
      layer.layerType === 'image' &&
      layer.src === 'assets/images/shader background/background.png'
    );
    if (imageLayer) imageLayer.src = offlineAssets.shaderBackground;
  }

  const blob = new Blob([JSON.stringify(projectData)], { type: 'application/json' });
  const blobUrl = URL.createObjectURL(blob);
  
  container.setAttribute('data-cr-project-src', blobUrl);
  CoreRenderer.init().then(() => {
    URL.revokeObjectURL(blobUrl);
    
    const e = new MouseEvent('mousemove', {
      clientX: lastMouseX,
      clientY: lastMouseY,
      bubbles: true
    });
    window.dispatchEvent(e);
    window.dispatchEvent(new Event('scroll'));
  }).catch(err => {
    URL.revokeObjectURL(blobUrl);
    container.querySelectorAll('canvas').forEach(canvas => canvas.remove());
    container.classList.add('is-static');
    console.error('CoreRenderer init failed:', err);
  });
}

gsap.registerPlugin(ScrollTrigger);

const introBg = document.getElementById('intro-bg');
const pContent = document.getElementById('preloader-content');
const pLogo = document.getElementById('preloader-logo');
const pLuke = document.getElementById('preloader-luke');
const pBaffait = document.getElementById('preloader-baffait');
const pDot = document.getElementById('preloader-dot');
const tPanelRed = document.getElementById('t-panel-red');
const tPanelDark = document.getElementById('t-panel-dark');
const hero = document.getElementById('hero');
const nameLayer = document.getElementById('name-layer');

function splitIntoChars(el) {
  const raw = el.textContent;
  el.innerHTML = '';
  const inners = [];
  raw.split('').forEach(ch => {
    const outer = document.createElement('span');
    outer.style.cssText = 'display:inline-block;overflow:hidden;vertical-align:top;padding:0.15em 0.3em;margin:-0.15em -0.3em;';
    const inner = document.createElement('span');
    inner.className = 'char';
    inner.style.display = 'inline-block';
    inner.textContent = ch === ' ' ? ' ' : ch;
    outer.appendChild(inner);
    el.appendChild(outer);
    inners.push(inner);
  });
  return inners;
}

const logoChar = splitIntoChars(pLogo);
const lukeChars = splitIntoChars(pLuke);
const baffaitChars = splitIntoChars(pBaffait);
const allChars = [...lukeChars, ...baffaitChars];
const allRevealEls = [...logoChar, ...lukeChars, ...baffaitChars];

const nameWordGapRatio = 0.55;
const desktopNameBottomPad = 80;

function getNameCanvasPad(viewportWidth = getViewportSize().width) {
  if (viewportWidth <= 768) return 20;
  return Math.min(Math.max(viewportWidth * 0.06, 72), 128);
}

function getNameFitWidth(viewportSize = getViewportSize()) {
  const pad = getNameCanvasPad(viewportSize.width);
  return Math.max(viewportSize.width - pad * 2, 240);
}

function getCharGap() {
  return parseFloat(getComputedStyle(pBaffait).fontSize) * nameWordGapRatio;
}

function layoutNames() {
  const fs = parseFloat(getComputedStyle(pBaffait).fontSize);
  if (!fs) return;
  const baselineOffset = -0.06; 

  const lukeLeft = pLuke.offsetLeft;
  const lukeWidth = pLuke.offsetWidth;
  const gapPx = fs * nameWordGapRatio;

  const baffaitLeftPx = lukeLeft + lukeWidth + gapPx;
  pBaffait.style.left = (baffaitLeftPx / fs) + 'em';
  pBaffait.style.top = baselineOffset + 'em';

  const dotLeftPx = baffaitLeftPx + pBaffait.offsetWidth;
  pDot.style.left = (dotLeftPx / fs) + 'em';
  pDot.style.top = baselineOffset + 'em';
}
layoutNames();

gsap.set(pLogo, { opacity: 1 });
gsap.set(pLuke, { opacity: 1 });
gsap.set(pBaffait, { opacity: 1 });
gsap.set(allRevealEls, { yPercent: 110 });
gsap.set(pDot, { opacity: 0 });

gsap.set([pContent, tPanelRed, tPanelDark], { willChange: 'transform' });

function getTotalWidth() {
  return pLogo.offsetWidth + pLuke.offsetWidth + getCharGap() + pBaffait.offsetWidth + pDot.offsetWidth;
}

let keepIntroNameAnchored = false;
let nameAnchorRaf = 0;

function getViewportSize() {

  const root = document.documentElement;
  return {
    width: root.clientWidth || window.innerWidth,
    height: window.innerHeight,
  };
}

function isMobileViewport() {
  return getViewportSize().width <= 768;
}

let _introSettledXvw = 0;

function placeIntroNameAtBottom() {
  layoutNames();
  const totalW = getTotalWidth();
  const viewportSize = getViewportSize();
  const offsetX = -(totalW / 2 - pLogo.offsetWidth / 2);
  const offsetX_vw = (offsetX / getViewportSize().width) * 100;
  _introSettledXvw = offsetX_vw;
  const newH = pContent.offsetHeight;
  const vh = viewportSize.height;

  
  const bottomPad = isMobileViewport() ? Math.max(vh * 0.12, 80) : desktopNameBottomPad;
  const targetBottom = vh - bottomPad;
  const offsetY = targetBottom - newH / 2 - vh / 2;
  gsap.set(pContent, { x: `${offsetX_vw}vw`, y: offsetY, transformOrigin: '50% 50%' });
}

function fitIntroNameToViewport() {
  layoutNames();
  const viewportSize = getViewportSize();
  const targetW = getNameFitWidth(viewportSize);
  const totalW = getTotalWidth();
  const currentFontSize = parseFloat(getComputedStyle(pLogo).fontSize);
  if (!totalW || !currentFontSize) return;

  const nextFontSize = currentFontSize * (targetW / totalW);
  const vwSize = (nextFontSize / viewportSize.width) * 100;
  [pLogo, pLuke, pBaffait, pDot].forEach(el => {
    el.style.fontSize = `${vwSize}vw`;
  });
  layoutNames();
  placeIntroNameAtBottom();
}

function refreshIntroNameAnchor() {
  if (!keepIntroNameAnchored) return;
  if (nameAnchorRaf) cancelAnimationFrame(nameAnchorRaf);
  nameAnchorRaf = requestAnimationFrame(() => {
    nameAnchorRaf = 0;
    fitIntroNameToViewport();
  });
}

function stopIntroNameAnchor() {
  keepIntroNameAnchored = false;
  if (nameAnchorRaf) {
    cancelAnimationFrame(nameAnchorRaf);
    nameAnchorRaf = 0;
  }
  window.removeEventListener('resize', refreshIntroNameAnchor);
}

window.addEventListener('resize', refreshIntroNameAnchor);

function refreshIntroNameAfterAssets() {
  if (keepIntroNameAnchored || mustSkip) fitIntroNameToViewport();
}

if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(refreshIntroNameAfterAssets).catch(() => {});
}

window.addEventListener('load', refreshIntroNameAfterAssets, { once: true });

const master = gsap.timeline({ delay: 0.2 });

master
  .add(() => {
    layoutNames();
    gsap.set(pContent, { x: -(getTotalWidth() / 2 - pLogo.offsetWidth / 2) });
    gsap.set(pLuke, { x: 0 });
  })
  .to(allRevealEls, {
    yPercent: 0,
    duration: 0.4,
    ease: 'power3.out',
    stagger: { each: 0.025, from: 'center' },
  })
  .add(() => layoutNames())
  .to(pDot, {
    opacity: 1,
    duration: 0.25,
    ease: 'power2.out',
  })
  .add(() => {
    startShader();
    document.getElementById('hero-tagline')?.style.setProperty('will-change', 'opacity, clip-path');
    document.getElementById('hero-bar')?.style.setProperty('will-change', 'opacity, clip-path');
    document.getElementById('hero-line')?.style.setProperty('will-change', 'transform');
  })
  .to({}, { duration: 0.3 })
  .add(() => {
    const mobile = isMobileViewport();
    const currentW = getTotalWidth();
    const viewportSize = getViewportSize();
    const targetW = getNameFitWidth(viewportSize);
    const scale = targetW / currentW;

    const visualCenterX = getTotalWidth() / 2;
    const visualCenterY = pContent.offsetHeight / 2;
    gsap.set(pContent, { transformOrigin: `${visualCenterX}px ${visualCenterY}px` });

    const vh = viewportSize.height;
    const bottomPad = mobile ? Math.max(vh * 0.18, 110) : desktopNameBottomPad;
    const targetBottom = vh - bottomPad;
    const contentRect = pContent.getBoundingClientRect();
    const curVisualCenterY = contentRect.top + visualCenterY;
    const targetVisualCenterY = targetBottom - (pContent.offsetHeight * scale / 2);
    const deltaY = targetVisualCenterY - curVisualCenterY;

    const baseFontSize = parseFloat(getComputedStyle(pLogo).fontSize);
    const newFontSize = baseFontSize * scale;

    const applyFinalState = () => {
      pContent.style.visibility = 'hidden';
      gsap.set(pContent, { scale: 1, x: 0, y: 0 });
      gsap.set(nameLayer, { mixBlendMode: 'difference' });
      const vwSize = (newFontSize / viewportSize.width) * 100;
      [pLogo, pLuke, pBaffait, pDot].forEach(el => {
        el.style.fontSize = `${vwSize}vw`;
      });
      void pContent.offsetWidth;
      placeIntroNameAtBottom();
      keepIntroNameAnchored = true;
      pContent.style.visibility = 'visible';
    };

    if (shouldSkipLongIntro || prefersReducedMotion) {
      applyFinalState();
      return;
    }

    gsap.to(pContent, {
      scale: scale,
      y: `+=${deltaY}`,
      duration: 0.75,
      ease: 'power3.inOut',
      onComplete: () => {
        requestAnimationFrame(applyFinalState);
      },
    });
  })
  .to(tPanelDark, {
    y: '0%',
    duration: 0.45,
    ease: 'power3.inOut',
  }, '<+=0.05')
  .to(tPanelRed, {
    y: '0%',
    duration: 0.45,
    ease: 'power3.inOut',
  }, '-=0.3')
  .set(introBg, { display: 'none' })
  .set(hero, { opacity: 1 })
  .to(tPanelRed, {
    y: '-100%',
    duration: 0.55,
    ease: 'power3.inOut',
  }, '+=0.05')
  .to(tPanelDark, {
    y: '-100%',
    duration: 0.55,
    ease: 'power3.inOut',
  }, '-=0.4')
  .to('#hero-tagline', {
    opacity: 1,
    clipPath: 'inset(0 0 0% 0)',
    duration: 1.1,
    ease: 'power3.inOut',
  }, '-=0.2')
  .to('#hero-bar', {
    opacity: 1,
    clipPath: 'inset(0 0 0% 0)',
    duration: 1.0,
    ease: 'power3.inOut',
  }, '-=0.8')
  .fromTo('#hero-line',
    { opacity: 1, scaleX: 0 },
    { scaleX: 1, duration: 1.0, ease: 'power3.inOut' },
    '<')
  .add(() => {
    document.querySelectorAll('.ch-top').forEach(el => { el.style.willChange = 'clip-path'; });
    chrHoverTl.play();
  }, '-=0.8');

document.querySelectorAll('.chr-hover[data-chr]').forEach(el => {
  const text = el.dataset.chr;
  [...text].forEach((ch, i) => {
    const wrap = document.createElement('span');
    wrap.className = 'ch-wrap';
    wrap.style.setProperty('--i', i);
    const top = document.createElement('span');
    top.className = 'ch-top';
    top.innerHTML = window.getCharHTML(ch);
    const bot = document.createElement('span');
    bot.className = 'ch-bot';
    bot.innerHTML = window.getCharHTML(ch);
    wrap.appendChild(top);
    wrap.appendChild(bot);
    el.appendChild(wrap);
  });
});

const chrHoverTl = gsap.timeline({ paused: true });
document.querySelectorAll('.chr-hover').forEach((el, elIdx) => {
  el.querySelectorAll('.ch-top').forEach((ch, i) => {
    const pos = elIdx * 0.08 + i * 0.03;
    chrHoverTl.fromTo(ch,
      { clipPath: 'inset(100% 0 0 0)', immediateRender: false },
      { clipPath: 'inset(0 0 0 0)', duration: 0.7, ease: 'power3.out' },
      pos
    );
  });
});

const lenis = new Lenis({ lerp: 0.06 });
lenis.on('scroll', ScrollTrigger.update);
gsap.ticker.add((time) => lenis.raf(time * 1000));
gsap.ticker.lagSmoothing(0);

lenis.stop();
lenis.scrollTo(0, { immediate: true });
let revealSetupStarted = false;

master.add(() => {

  window.removeEventListener('scroll', _forceScrollTop);
  if (isMobile) {
    document.removeEventListener('touchmove', _preventTouchScroll);
  } else {
    document.documentElement.style.overflow = '';
  }
  _forceScrollTop();
  requestAnimationFrame(_forceScrollTop);
  lenis.start();
  lenis.scrollTo(0, { immediate: true });

  allRevealEls.forEach(ch => { ch.style.willChange = 'auto'; });
  gsap.set([pContent, tPanelRed, tPanelDark], { willChange: 'auto' });
  document.getElementById('hero-tagline')?.style.setProperty('will-change', 'auto');
  document.getElementById('hero-bar')?.style.setProperty('will-change', 'auto');
  document.getElementById('hero-line')?.style.setProperty('will-change', 'auto');
  document.querySelectorAll('.ch-top').forEach(el => { el.style.willChange = 'auto'; });

  
  const tPanel = document.getElementById('transition-panel');
  if (tPanel) tPanel.remove();
  const iBg = document.getElementById('intro-bg');
  if (iBg) iBg.remove();

  
  requestAnimationFrame(() => {
    if (revealSetupStarted) return;
    revealSetupStarted = true;
    setupScrollReveal().catch(err => {
      console.error('setupScrollReveal failed:', err);
    });
  });
});

if (mustSkip) {
  master.progress(1);
  master.pause();
  if (!shouldSkipLongIntro) {
    lenis.scrollTo(0, { immediate: true });
    _forceScrollTop();
    requestAnimationFrame(() => {
      _forceScrollTop();
      ScrollTrigger.refresh();
    });
  }
}

async function setupScrollReveal() {
  if (nameAnchorRaf) {
    cancelAnimationFrame(nameAnchorRaf);
    nameAnchorRaf = 0;
  }

  
  [pContent, pLogo, pLuke, pBaffait, pDot].forEach(el => gsap.killTweensOf(el));

  const revealWrap = document.getElementById('reveal-image-wrap');
  const revealSeq = document.querySelectorAll('.reveal-seq');
  const canvas = document.getElementById('reveal-canvas');
  const ctx = canvas.getContext('2d');

  
  const phraseEl = document.getElementById('reveal-phrase');
  phraseEl.innerHTML = [...phraseEl.textContent].map(ch =>
    `<span class="rp-char" style="display:inline-block;">${ch === ' ' ? ' ' : ch}</span>`
  ).join('');
  const phraseChars = phraseEl.querySelectorAll('.rp-char');
  gsap.set(phraseChars, isMobile ? { opacity: 0 } : { opacity: 0, filter: 'blur(10px)' });

  
  const FRAME_DIR = 'assets/images/hero%20sequence/';
  const FRAME_EXT = '.jpg';
  const FRAME_PAD = 4;
  const TOTAL_FRAMES = 341;
  const FRAME_CACHE_KEY = '20260416-r2'; 
  const frameUrl = n => `${FRAME_DIR}${String(n).padStart(FRAME_PAD, '0')}${FRAME_EXT}?v=${FRAME_CACHE_KEY}`;
  const SPEED_BATCH = 10;

  const frames = new Array(TOTAL_FRAMES);
  let loadedFrameIdx = [];
  let totalFrames = 0;
  let drawnIdx = -1;

  function rebuildLoadedFrameIndex() {
    loadedFrameIdx = [];
    for (let i = 0; i < frames.length; i++) {
      if (frames[i] && frames[i].naturalWidth) loadedFrameIdx.push(i);
    }
    totalFrames = loadedFrameIdx.length;
  }

  
  canvas.style.willChange = 'transform';

  function resizeCanvas() {
    
    const dpr = isSlowHardware ? 1 : Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    if (drawnIdx >= 0) { const i = drawnIdx; drawnIdx = -1; drawFrame(i); }
  }
  let _lastDrawMs = 0;
  function drawFrame(i) {
    if (i === drawnIdx) return;
    
    if (isSlowHardware) {
      const now = performance.now();
      if (now - _lastDrawMs < 32) return;
      _lastDrawMs = now;
    }
    if (i < 0 || i >= frames.length) return;
    const img = frames[i];
    if (!(img && img.naturalWidth)) return;
    const cw = canvas.width, ch = canvas.height;
    const iw = img.naturalWidth, ih = img.naturalHeight;
    const s = Math.max(cw / iw, ch / ih);
    const dw = iw * s, dh = ih * s;
    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(img, (cw - dw) * 0.5, (ch - dh) * 0.5, dw, dh);
    drawnIdx = i;
  }
  function probe(n) {
    return new Promise(resolve => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = frameUrl(n);
    });
  }
  async function probeWithRetry(n, attempts = 3) {
    for (let k = 0; k < attempts; k++) {
      const img = await probe(n);
      if (img) return img;
    }
    return null;
  }
  async function loadFirstBatch() {
    const first = await probeWithRetry(1, 3);
    if (!first) { console.error('Frame 1 failed to load!'); return 0; }
    frames[0] = first;
    rebuildLoadedFrameIndex();
    resizeCanvas();
    drawFrame(0);

    const t0 = performance.now();
    const batchNums = Array.from({ length: Math.min(SPEED_BATCH, TOTAL_FRAMES - 1) }, (_, k) => k + 2);
    await Promise.all(batchNums.map(async n => {
      const img = await probeWithRetry(n, 2);
      if (img) frames[n - 1] = img;
    }));
    const elapsed = performance.now() - t0;
    rebuildLoadedFrameIndex();
    return elapsed > 4000 ? 3 : elapsed > 2000 ? 2 : 1;
  }

  async function loadRemainingFrames(skip) {
    const BATCH_END = 11;
    const toLoad = [];
    for (let i = BATCH_END + 1; i <= TOTAL_FRAMES; i++) {
      if (skip <= 1 || i % skip === 0) toLoad.push(i);
    }
    let cursor = 0;
    const failed = [];
    
    
    const CONCURRENCY = isSlowHardware ? 2 : 6;
    const worker = async () => {
      while (cursor < toLoad.length) {
        const n = toLoad[cursor++];
        if (frames[n - 1]?.naturalWidth) continue;
        const img = await probeWithRetry(n, 2);
        if (img) { frames[n - 1] = img; rebuildLoadedFrameIndex(); }
        else failed.push(n);
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    for (const n of [...failed]) {
      const img = await probeWithRetry(n, 2);
      if (img) { frames[n - 1] = img; rebuildLoadedFrameIndex(); }
    }
  }

  window.addEventListener('resize', resizeCanvas);
  let frameSkip = await loadFirstBatch();
  if (isMobile) frameSkip = Math.max(frameSkip, 3);

  if (totalFrames === 0) {
    console.error('No reveal frames loaded.');
    return;
  }

  loadRemainingFrames(frameSkip).catch(err => console.error('Frame background load error:', err));

  const introSettledY = Number(gsap.getProperty(pContent, 'y')) || 0;
  
  const introXvw = `${_introSettledXvw}vw`;

  const scrollTl = gsap.timeline({ paused: true });

  scrollTl.fromTo(pContent, { x: introXvw, y: introSettledY }, { x: introXvw, y: 0, duration: 0.3, ease: 'none' }, 0);
  scrollTl.fromTo('#hero-tagline', { opacity: 1 }, { opacity: 0, duration: 0.15, ease: 'none' }, 0);
  scrollTl.fromTo('#hero-bar', { opacity: 1 }, { opacity: 0, duration: 0.15, ease: 'none' }, 0);
  scrollTl.fromTo('#hero-line', { opacity: 1 }, { opacity: 0, duration: 0.15, ease: 'none' }, 0);

  
  scrollTl.fromTo(revealWrap, { opacity: 0 }, { opacity: 1, duration: 0.01 }, 0.3);
  scrollTl.fromTo(revealSeq, { scale: 0 }, {
    scale: 1,
    duration: 0.7,
    ease: 'none',
  }, 0.3);

  
  const mobile = isMobileViewport();
  const exitLeft = mobile ? '-35vw' : '-55vw';
  const exitRight = mobile ? '35vw' : '55vw';
  scrollTl.fromTo(pLogo, { x: '0vw', opacity: 1 }, { x: exitLeft, opacity: 0, duration: 0.7, ease: 'none' }, 0.3);
  scrollTl.fromTo(pLuke, { x: '0vw', opacity: 1 }, { x: exitLeft, opacity: 0, duration: 0.7, ease: 'none' }, 0.3);
  scrollTl.fromTo(pBaffait, { x: '0vw', opacity: 1 }, { x: exitRight, opacity: 0, duration: 0.7, ease: 'none' }, 0.3);
  scrollTl.fromTo(pDot, { x: '0vw', opacity: 1 }, { x: exitRight, opacity: 0, duration: 0.7, ease: 'none' }, 0.3);

  scrollTl.set(nameLayer, { autoAlpha: 0 }, 0.98);

  
  scrollTl.to(phraseChars, {
    opacity: 1,
    ...(isMobile ? {} : { filter: 'blur(0px)' }),
    duration: 0.06,
    ease: 'none',
    stagger: { each: 0.007, from: 'start' },
  }, 0.62);

  const REVEAL_PHASE_START = 0.3;
  const REVEAL_PHASE_DURATION = 0.7;
  const FRAME_PROGRESS_AT_EXIT_START = 0.82;

  function drawFrameAtProgress(progress) {
    if (totalFrames === 0) return;
    const clamped = Math.min(1, Math.max(0, progress));
    const loadedPos = Math.round(clamped * (totalFrames - 1));
    const sourceIdx = loadedFrameIdx[loadedPos];
    if (sourceIdx == null) return;
    drawFrame(sourceIdx);
  }

  ScrollTrigger.create({
    trigger: '#scroll-wrap',
    start: 'top top',
    end: 'bottom bottom',
    scrub: 0.5,
    animation: scrollTl,
    onUpdate: (self) => {
      
      const p = self.progress;
      if (keepIntroNameAnchored && p > 0.001) {
        stopIntroNameAnchor();
      }
      if (p < REVEAL_PHASE_START) {
        drawFrameAtProgress(0);
        return;
      }
      const phase2 = Math.min(1, Math.max(0, (p - REVEAL_PHASE_START) / REVEAL_PHASE_DURATION));
      drawFrameAtProgress(phase2 * FRAME_PROGRESS_AT_EXIT_START);
    },
  });

  
  const revealOverlay = document.getElementById('reveal-overlay');

  const exitTl = gsap.timeline({ paused: true });
  exitTl.to(revealWrap, { y: '-50vh', ease: 'none', duration: 1 }, 0);
  exitTl.to(revealOverlay, { opacity: 0.7, ease: 'none', duration: 0.66 }, 0);
  
  
  
  if (!isMobile && (CSS.supports('backdrop-filter', 'blur(1px)') || CSS.supports('-webkit-backdrop-filter', 'blur(1px)'))) {
    gsap.set(revealOverlay, { backdropFilter: 'blur(0px)' });
    exitTl.to(revealOverlay, { backdropFilter: 'blur(16px)', ease: 'none', duration: 1 }, 0);
  }
  const phraseExitTl = gsap.timeline({ paused: true });
  phraseExitTl.to(phraseChars, {
    opacity: 0,
    duration: 0.2,
    ease: 'none',
    immediateRender: false,
    stagger: { each: 0.01, from: 'end' },
  });
  ScrollTrigger.create({
    trigger: '#section-after',
    start: 'top bottom',
    end: 'top top',
    scrub: true,
    animation: phraseExitTl,
  });

  ScrollTrigger.create({
    trigger: '#section-after',
    start: 'top bottom',
    end: 'top top',
    scrub: true,
    animation: exitTl,
    onUpdate: (self) => {
      const exitFrameProgress = FRAME_PROGRESS_AT_EXIT_START + (self.progress * (1 - FRAME_PROGRESS_AT_EXIT_START));
      drawFrameAtProgress(exitFrameProgress);
    },
    onLeave: () => drawFrameAtProgress(1),
    onLeaveBack: () => drawFrameAtProgress(FRAME_PROGRESS_AT_EXIT_START),
  });

  
  setupAboutSection();
}

function setupAboutSection() {
  const aboutText = document.getElementById('about-text');
  const photoWrap = document.getElementById('about-photo-wrap');

  
  function wrapWords(el) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);

    textNodes.forEach(node => {
      const words = node.textContent.split(/(\s+)/);
      const frag = document.createDocumentFragment();
      words.forEach(w => {
        if (/^\s+$/.test(w)) {
          frag.appendChild(document.createTextNode(w));
        } else if (w) {
          const span = document.createElement('span');
          span.className = 'word';
          span.textContent = w;
          frag.appendChild(span);
        }
      });
      node.parentNode.replaceChild(frag, node);
    });
  }
  const aboutSub = document.getElementById('about-sub');
  const aboutMeta = document.getElementById('about-meta');
  const aboutVersion = document.querySelector('.about-version');
  const aboutIcon = aboutVersion.querySelector('svg');
  if (aboutIcon) {
    aboutIcon.classList.add('word');
  }
  wrapWords(aboutText);
  wrapWords(aboutVersion);

  if (isMobile) {
    [...aboutText.querySelectorAll('.word'), ...aboutVersion.querySelectorAll('.word')].forEach(w => { w.style.filter = 'none'; });
  }

  [...aboutText.querySelectorAll('.word'), ...aboutVersion.querySelectorAll('.word')].forEach(word => {
    gsap.to(word, {
      opacity: 1,
      ...(isMobile ? {} : { filter: 'blur(0px)' }),
      ease: 'none',
      scrollTrigger: {
        trigger: word,
        start: 'top 75%',
        end: 'top 60%',
        scrub: true,
      },
    });
  });

  const aboutCopyTargets = [aboutSub, aboutMeta].filter(Boolean);
  gsap.set(aboutCopyTargets, isMobile ? { opacity: 0 } : { opacity: 0, filter: 'blur(12px)' });
  gsap.to(aboutCopyTargets, {
    opacity: 1,
    ...(isMobile ? {} : { filter: 'blur(0px)' }),
    ease: 'none',
    scrollTrigger: {
      trigger: aboutSub,
      start: 'top 80%',
      end: 'top 60%',
      scrub: true,
    },
  });

  
  const photo = photoWrap.querySelector('.about-photo');
  function initPhotoScroll() {
    
    var tl = gsap.timeline({
      scrollTrigger: {
        trigger: photoWrap,
        start: 'top bottom',
        end: 'bottom top',
        scrub: true,
      },
    });
    
    tl.fromTo(photo, { y: '-50%' }, { y: '50%', ease: 'none' }, 0);
    
    tl.fromTo(photo, { opacity: 0, filter: 'blur(20px)' }, { opacity: 1, filter: 'blur(0px)', ease: 'none', duration: 0.3 }, 0);
  }
  if (photo.decode) {
    photo.decode().then(initPhotoScroll).catch(initPhotoScroll);
  } else {
    photo.onload = initPhotoScroll;
    if (photo.complete) initPhotoScroll();
  }

  setupProjectsSection();
}

function setupProjectsSection() {
  const items = document.querySelectorAll('.proj-item');
  const card = document.getElementById('proj-card');
  const cover = document.getElementById('proj-cover');
  const dateEl = document.getElementById('proj-date');
  const preview = document.getElementById('proj-preview');
  let currentIdx = -1;
  gsap.set(card, { opacity: 0 });

  
  const _coverCache = [];
  items.forEach(item => {
    const img = new Image();
    img.src = item.dataset.img;
    if (img.decode) img.decode().catch(() => { });
    _coverCache.push(img);
  });

  
  const projectsEl = document.getElementById('projects');
  ScrollTrigger.create({
    trigger: projectsEl,
    start: 'top 80%',
    end: 'bottom 20%',
    onEnter: () => { preview.classList.add('visible'); _projectsVisible = true; },
    onLeave: () => { preview.classList.remove('visible'); _projectsVisible = false; },
    onEnterBack: () => { preview.classList.add('visible'); _projectsVisible = true; },
    onLeaveBack: () => { preview.classList.remove('visible'); _projectsVisible = false; },
  });

  
  const itemQuickX = [...items].map(item =>
    gsap.quickTo(item, 'x', { duration: 0.6, ease: 'power2.out' })
  );
  let _projectsVisible = false;

  
  items.forEach((item, i) => {
    item.addEventListener('click', () => {
      if (item.classList.contains('active')) {
        openProject(item.dataset.id, item);
      } else {
        activateProject(i);
        
        let docTop = 0, el = item;
        while (el) { docTop += el.offsetTop; el = el.offsetParent; }
        lenis.scrollTo(docTop - window.innerHeight / 2 + item.offsetHeight / 2, { duration: 1.2 });
      }
    });
  });
  cover.addEventListener('click', () => {
    if (currentIdx >= 0) openProject(items[currentIdx].dataset.id, items[currentIdx]);
  });

  function onProjectsScroll() {
    if (!_projectsVisible) {
      if (currentIdx >= 0) deactivateAll();
      return;
    }
    const cy = window.innerHeight / 2;
    const halfH = window.innerHeight / 2;
    let closestIdx = -1, closestDist = Infinity;
    items.forEach((item, i) => {
      const rect = item.getBoundingClientRect();
      const itemCy = rect.top + rect.height / 2;
      const dist = Math.abs(itemCy - cy);
      
      itemQuickX[i](Math.min(dist / halfH, 1) * 80);
      
      if (dist < closestDist) { closestDist = dist; closestIdx = i; }
    });
    if (closestIdx >= 0 && closestDist < window.innerHeight * 0.45) {
      activateProject(closestIdx);
    } else {
      deactivateAll();
    }
  }
  lenis.on('scroll', onProjectsScroll);
  onProjectsScroll();

  function deactivateAll() {
    if (currentIdx >= 0) items[currentIdx].classList.remove('active');
    currentIdx = -1;
    gsap.to(card, { opacity: 0, duration: 0.25, ease: 'power2.in' });
  }

  function activateProject(i) {
    if (i === currentIdx) return;
    if (currentIdx >= 0) items[currentIdx].classList.remove('active');
    items[i].classList.add('active');

    if (currentIdx === -1) {
      
      cover.src = items[i].dataset.img;
      dateEl.textContent = items[i].dataset.date;
      gsap.to(card, { opacity: 1, duration: 0.4, ease: 'power2.out' });
    } else {
      
      gsap.to(card, {
        opacity: 0,
        duration: 0.18,
        ease: 'power2.in',
        onComplete: () => {
          cover.src = items[i].dataset.img;
          dateEl.textContent = items[i].dataset.date;
          gsap.to(card, { opacity: 1, duration: 0.3, ease: 'power2.out' });
        },
      });
    }
    currentIdx = i;
  }

  const projCursor = document.getElementById('proj-cursor');
  const qCursorX = gsap.quickTo(projCursor, 'left', { duration: 0.35, ease: 'power3.out' });
  const qCursorY = gsap.quickTo(projCursor, 'top', { duration: 0.35, ease: 'power3.out' });
  let _tiltTargetRY = 0, _tiltTargetRX = 0, _tiltRY = 0, _tiltRX = 0;
  
  let _detTiltTargetRY = 0, _detTiltTargetRX = 0, _detTiltRY = 0, _detTiltRX = 0;

  cover.addEventListener('mouseenter', () => {
    projCursor.classList.add('active');
  });

  cover.addEventListener('mouseleave', () => {
    projCursor.classList.remove('active');
  });

  
  let _cachedSelImg = null;

  
  document.addEventListener('mousemove', (e) => {
    
    if (_projectsVisible) {
      qCursorX(e.clientX);
      qCursorY(e.clientY);
    }
    
    if (_projectsVisible) {
      const rect = card.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      
      
      const ry = Math.max(-1, Math.min(1, (e.clientX - cx) / (rect.width / 2)));
      const rx = Math.max(-1, Math.min(1, (e.clientY - cy) / (rect.height / 2)));
      _tiltTargetRY = ry * 6;
      _tiltTargetRX = -rx * 5;
    }

    if (projectOpen && _cachedSelImg) {
      var sr = _cachedSelImg.getBoundingClientRect();
      var scx = sr.left + sr.width / 2;
      var scy = sr.top + sr.height / 2;
      const dry = Math.max(-1, Math.min(1, (e.clientX - scx) / (sr.width / 2)));
      const drx = Math.max(-1, Math.min(1, (e.clientY - scy) / (sr.height / 2)));
      _detTiltTargetRY = dry * 8;
      _detTiltTargetRX = -drx * 6;
    }
  });

  
  gsap.ticker.add(() => {
    if (_projectsVisible) {
      _tiltRY += (_tiltTargetRY - _tiltRY) * 0.12;
      _tiltRX += (_tiltTargetRX - _tiltRX) * 0.12;
      card.style.transform = 'rotateY(' + _tiltRY.toFixed(2) + 'deg) rotateX(' + _tiltRX.toFixed(2) + 'deg)';
    }
    if (projectOpen && _cachedSelImg) {
      _detTiltRY += (_detTiltTargetRY - _detTiltRY) * 0.1;
      _detTiltRX += (_detTiltTargetRX - _detTiltRX) * 0.1;
      _cachedSelImg.style.transform = 'rotateY(' + _detTiltRY.toFixed(2) + 'deg) rotateX(' + _detTiltRX.toFixed(2) + 'deg)';
    }
  });

  
  items.forEach(item => {
    ScrollTrigger.create({
      trigger: item,
      start: 'top 52%',
      end: 'bottom 48%',
      onEnter: () => lenis && lenis.options && (lenis.options.lerp = 0.04),
      onLeave: () => lenis && lenis.options && (lenis.options.lerp = 0.06),
      onEnterBack: () => lenis && lenis.options && (lenis.options.lerp = 0.04),
      onLeaveBack: () => lenis && lenis.options && (lenis.options.lerp = 0.06),
    });
  });

  
  const linePath = document.getElementById('fluid-line');
  const lineLen = linePath.getTotalLength();

  
  gsap.set(linePath, { strokeDasharray: lineLen, strokeDashoffset: lineLen });

  
  gsap.to(linePath, {
    strokeDashoffset: 0,
    ease: 'none',
    scrollTrigger: {
      trigger: '#projects',
      start: 'top 70%',
      end: 'bottom 20%',
      scrub: 1,
    },
  });

  
  ; (function () {
    if (isMobileViewport()) return; 

    const vw = window.innerWidth;
    const vh = window.innerHeight;

    
    (function buildSlices() {
      var SLICES = 10;
      var imgW = Math.min(Math.max(120, vw * 0.14), 210);
      var imgH = imgW;
      
      var orbitR = (vw * 0.34 + 500) / 2; 
      var bendRad = imgW / orbitR;
      var cylR = orbitR;
      var sliceW = imgW / SLICES;
      var totalBendDeg = bendRad * 180 / Math.PI;
      var stepDeg = totalBendDeg / SLICES;

      document.querySelectorAll('.cg-img').forEach(function (img) {
        var src = img.getAttribute('src');
        var wrapper = document.createElement('div');
        wrapper.className = 'cg-img';

        for (var s = 0; s < SLICES; s++) {
          var sl = document.createElement('div');
          sl.className = 'cg-slice';
          var displayW = sliceW + 1.5; 
          sl.style.width = displayW.toFixed(1) + 'px';
          sl.style.left = '50%';
          sl.style.marginLeft = (-displayW / 2).toFixed(1) + 'px';
          sl.style.backgroundImage = 'url(' + src + ')';
          sl.style.backgroundSize = imgW.toFixed(1) + 'px ' + imgH.toFixed(1) + 'px';
          sl.style.backgroundPosition = (-s * sliceW).toFixed(1) + 'px 0';
          sl.style.transformOrigin = '50% 50% ' + (-cylR).toFixed(1) + 'px';
          var angle = (s - (SLICES - 1) / 2) * stepDeg;
          sl.style.transform = 'rotateY(' + angle.toFixed(2) + 'deg)';
          wrapper.appendChild(sl);
        }

        img.parentNode.replaceChild(wrapper, img);
      });
    })();

    const cgImgs = gsap.utils.toArray('.cg-img');
    const cgPhrase = document.getElementById('cg-phrase');
    const count = cgImgs.length;

    
    (function wrapPhraseWords(el) {
      var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      var textNodes = [];
      while (walker.nextNode()) textNodes.push(walker.currentNode);
      textNodes.forEach(function (node) {
        var words = node.textContent.split(/(\s+)/);
        var frag = document.createDocumentFragment();
        words.forEach(function (w) {
          if (/^\s+$/.test(w)) {
            frag.appendChild(document.createTextNode(w));
          } else if (w) {
            var span = document.createElement('span');
            span.className = 'word';
            span.textContent = w;
            frag.appendChild(span);
          }
        });
        node.parentNode.replaceChild(frag, node);
      });
    })(cgPhrase);
    var cgPhraseWords = gsap.utils.toArray('#cg-phrase .word');

    
    const rx = vw * 0.34;
    const rz = 500;
    const tiltY = vw <= 768 ? 80 : 180;

    
    var entryAngle = Math.PI / 2;
    var offX = vw * 0.85;

    function getPos(t) {
      if (t <= 0.12) {
        
        var p = t / 0.12;
        return {
          x: -offX * (1 - p),    
          y: tiltY,
          z: rz * p,             
          rotY: 0                
        };
      }
      if (t <= 0.88) {
        
        var p = (t - 0.12) / 0.76;
        var angle = entryAngle - p * Math.PI * 2;
        var x = Math.cos(angle) * rx;
        var z = Math.sin(angle) * rz;

        
        var ry = p * Math.PI * 2;

        return {
          x: x,
          y: (z / rz) * tiltY,
          z: z,
          rotY: ry
        };
      }
      
      var p = (t - 0.88) / 0.12;
      return {
        x: offX * p,             
        y: tiltY,
        z: rz * (1 - p),         
        rotY: Math.PI * 2        
      };
    }

    var stagger = 0.09;
    var totalRange = 1 + stagger * (count - 1);

    cgImgs.forEach(function (img) { img.style.opacity = '0'; });

    ScrollTrigger.create({
      trigger: '#circle-gallery',
      start: 'top top',
      end: 'bottom bottom',
      pin: '#circle-gallery-pin',
      onUpdate: function (self) {
        var progress = self.progress;

        cgImgs.forEach(function (img, i) {
          var imgT = progress * totalRange - i * stagger;

          if (imgT <= 0 || imgT >= 1) {
            img.style.opacity = '0';
            return;
          }

          var alpha = 1;
          if (imgT < 0.06) alpha = imgT / 0.06;
          else if (imgT > 0.94) alpha = (1 - imgT) / 0.06;

          var pos = getPos(imgT);
          var rotDeg = (pos.rotY * 180 / Math.PI).toFixed(1);

          img.style.transform =
            'translate3d(' + pos.x.toFixed(1) + 'px,' + pos.y.toFixed(1) + 'px,' + pos.z.toFixed(1) + 'px)' +
            ' rotateY(' + rotDeg + 'deg)';
          img.style.opacity = alpha;
          img.style.zIndex = Math.round(pos.z + 600);
        });

        
        var phraseStart = 0.25;
        var phraseEnd = 0.75;
        var travelY = 200; 

        if (progress < phraseStart || progress > phraseEnd) {
          cgPhrase.style.opacity = '0';
        } else {
          var globalP = (progress - phraseStart) / (phraseEnd - phraseStart);
          
          var yOffset = travelY * (0.5 - globalP); 
          cgPhrase.style.transform = 'translateY(' + yOffset.toFixed(1) + 'px)';

          
          var revealEnd = 0.4;
          cgPhraseWords.forEach(function (w, wi) {
            if (globalP < revealEnd) {
              var revealP = globalP / revealEnd;
              var wordT = revealP * (cgPhraseWords.length + 4) - wi;
              var wP = Math.max(0, Math.min(1, wordT / 3));
              w.style.opacity = wP;
              w.style.filter = 'blur(' + (8 * (1 - wP)).toFixed(1) + 'px)';
            } else {
              w.style.opacity = '1';
              w.style.filter = 'blur(0px)';
            }
          });

          
          var alpha = 1;
          if (globalP < 0.1) alpha = globalP / 0.1;
          else if (globalP > 0.75) alpha = (1 - globalP) / 0.25;
          cgPhrase.style.opacity = alpha;
        }
      }
    });
  })();

  
  ; (function () {
    function initScrollTimeline() {
    var timeline = document.getElementById('scroll-timeline');
    var bar = document.getElementById('st-bar');
    var label = document.getElementById('st-label');
    var pctEl = document.getElementById('scroll-pct');
    if (!timeline || !bar || !label || !pctEl || bar.children.length) return;

    var sections = [
      { id: 'about', name: '目录' },
      { id: 'projects', name: '价值' },
      { id: 'circle-gallery', name: '策略' },
      { id: 'skills', name: '现状问题' },
      { id: 'team-structure', name: '团队盘点' },
      { id: 'strategy', name: '试用期策略' },
      { id: 'awards', name: '关键战役' },
      { id: 'performance', name: '绩效指标' },
      { id: 'design-plan', name: '设计规划' },
      { id: 'contact', name: '交流' },
    ].filter(function (sec) {
      if (sec.id === 'circle-gallery' && isMobileViewport()) return false;
      if (!document.getElementById(sec.id)) return false;
      return true;
    });

    var scrollY0 = window.scrollY || window.pageYOffset;
    var zoneTop = document.getElementById(sections[0].id).getBoundingClientRect().top + scrollY0;
    var lastEl = document.getElementById(sections[sections.length - 1].id);
    var zoneBottom = lastEl.getBoundingClientRect().top + lastEl.offsetHeight + scrollY0;
    var zoneH = zoneBottom - zoneTop;

    
    var segEls = [];
    sections.forEach(function (sec) {
      var el = document.getElementById(sec.id);
      var elTop = el.getBoundingClientRect().top + scrollY0;
      sec.top = elTop;
      sec.bottom = elTop + el.offsetHeight;
      sec.ratio = el.offsetHeight / zoneH;

      var seg = document.createElement('div');
      seg.className = 'st-seg';
      seg.style.flex = sec.ratio.toFixed(4);
      seg.title = sec.name;
      var fill = document.createElement('div');
      fill.className = 'st-seg-fill';
      seg.appendChild(fill);
      bar.appendChild(seg);
      seg.addEventListener('click', (function (targetId) {
        return function () {
          var target = document.getElementById(targetId);
          if (!target) return;
          if (typeof lenis !== 'undefined' && lenis && lenis.scrollTo) {
            lenis.scrollTo(target, { offset: 0, duration: 1.2 });
          } else {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        };
      })(sec.id));
      segEls.push({ seg: seg, fill: fill });
    });

    ScrollTrigger.create({
      trigger: '#' + sections[0].id,
      start: 'top bottom',
      endTrigger: '#' + sections[sections.length - 1].id,
      end: 'bottom bottom',
      onUpdate: function (self) {
        var progress = self.progress;

        
        var docH = document.documentElement.scrollHeight - window.innerHeight;
        var pageP = docH > 0 ? Math.round((window.scrollY / docH) * 100) : 0;
        pctEl.textContent = '(' + pageP + ')';

        if (progress <= 0 || progress >= 0.90) {
          timeline.classList.remove('visible');
          pctEl.classList.remove('visible');
          timeline.style.opacity = '';
          pctEl.style.opacity = '';
          return;
        }
        timeline.classList.add('visible');
        pctEl.classList.add('visible');

        var activeIdx = 0;
        var cumul = 0;
        for (var i = 0; i < sections.length; i++) {
          var segStart = cumul;
          var segEnd = cumul + sections[i].ratio;

          if (progress < segEnd) {
            
            var inner = (progress - segStart) / sections[i].ratio;
            segEls[i].fill.style.height = (Math.min(1, Math.max(0, inner)) * 100).toFixed(1) + '%';
            activeIdx = i;
            
            for (var j = i + 1; j < sections.length; j++) {
              segEls[j].fill.style.height = '0%';
            }
            break;
          } else {
            
            segEls[i].fill.style.height = '100%';
          }
          cumul = segEnd;
        }

        label.textContent = sections[activeIdx].name;
        label.style.top = (progress * 100).toFixed(1) + '%';
      }
    });
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initScrollTimeline, { once: true });
    } else {
      initScrollTimeline();
    }
  })();

  
  ; (function () {
    var groups = document.querySelectorAll('.skill-group');

    
    var firstBody = groups[0].querySelector('.skill-body');
    firstBody.style.height = firstBody.scrollHeight + 'px';

    groups.forEach(function (group) {
      group.querySelector('.skill-header').addEventListener('click', function () {
        if (group.classList.contains('open')) return; 

        
        groups.forEach(function (g) {
          if (g.classList.contains('open')) {
            g.classList.remove('open');
            var body = g.querySelector('.skill-body');
            gsap.to(body, { height: 0, duration: 0.45, ease: 'power3.inOut' });
          }
        });

        
        group.classList.add('open');
        var body = group.querySelector('.skill-body');
        gsap.to(body, {
          height: body.scrollHeight, duration: 0.45, ease: 'power3.inOut',
          onComplete: function () { ScrollTrigger.refresh(); }
        });
      });
    });
  })();

  
  ; (function () {
    var arrow = document.getElementById('skills-arrow');
    if (!arrow) return;

    gsap.fromTo(arrow,
      { xPercent: 0 },
      {
        xPercent: 100,
        x: function () {
          var left = arrow.parentElement;
          var pad = parseFloat(getComputedStyle(left).paddingLeft) + parseFloat(getComputedStyle(left).paddingRight);
          return left.clientWidth - pad - arrow.offsetWidth;
        },
        ease: 'none',
        scrollTrigger: {
          trigger: '#skills',
          start: 'top top',
          endTrigger: '#contact',
          end: 'top center',
          scrub: 0.5,
        }
      }
    );
  })();

  
  ; (function () {
    var blobWrap = document.getElementById('contact-blob-wrap');
    var blob = document.getElementById('contact-blob');
    var title = document.getElementById('contact-title');
    var socials = document.getElementById('contact-socials');
    var mailEl = document.getElementById('contact-mail');
    var dispo = document.getElementById('contact-dispo');
    var frame = document.getElementById('contact-frame');
    var frameImg = document.getElementById('contact-frame-img');
    var dispo2 = document.getElementById('contact-dispo-2');
    var frame2 = document.getElementById('contact-frame-2');
    var frameImg2 = document.getElementById('contact-frame-img-2');
    var stTimeline = document.getElementById('scroll-timeline');
    var pctEl = document.getElementById('scroll-pct');
    if (!blob) return;

    
    document.querySelectorAll('[data-chr-contact]').forEach(function (el) {
      var text = el.getAttribute('data-chr-contact');
      el.removeAttribute('data-chr-contact');
      Array.from(text).forEach(function (ch, i) {
        if (ch === ' ') {
          el.insertAdjacentHTML('beforeend', '<span style="width:0.35em;display:inline-block">&nbsp;</span>');
          return;
        }
        var wrap = document.createElement('span');
        wrap.className = 'ch-wrap';
        wrap.style.setProperty('--i', i);
        const chHTML = window.getCharHTML ? window.getCharHTML(ch) : ch;
        wrap.innerHTML = '<span class="ch-top">' + chHTML + '</span><span class="ch-bot">' + chHTML + '</span>';
        el.appendChild(wrap);
      });
    });

    var contactBg = document.getElementById('contact-bg');

    ScrollTrigger.create({
      trigger: '#contact',
      start: 'top bottom',
      endTrigger: '#footer-transition',
      end: 'bottom bottom',
      onEnter: function () { blobWrap.style.visibility = 'visible'; contactBg.style.display = 'block'; },
      onLeave: function () { blobWrap.style.visibility = 'hidden'; contactBg.style.display = 'none'; },
      onLeaveBack: function () { blobWrap.style.visibility = 'hidden'; contactBg.style.display = 'none'; },
      onEnterBack: function () { blobWrap.style.visibility = 'visible'; contactBg.style.display = 'block'; },
    });
    blobWrap.style.visibility = 'hidden';

    var tl = gsap.timeline({
      scrollTrigger: {
        trigger: '#contact',
        start: 'top bottom',
        end: 'bottom bottom',
        scrub: true,
      }
    });

    
    tl.fromTo(blob,
      { scale: 0 },
      { scale: 1, duration: 0.6, ease: 'none' },
      0
    );

    
    tl.to([stTimeline, pctEl], { opacity: 0, duration: 0.08 }, 0.1);

    
    gsap.set(title, { yPercent: 0, x: function () { return window.innerWidth * 1.1; } });
    tl.to(title, {
      x: 0,
      duration: 0.3,
      ease: 'power3.out'
    }, 0.18);

    
    tl.fromTo(socials,
      { clipPath: 'inset(0 0 100% 0)' },
      { clipPath: 'inset(0 0 0% 0)', duration: 0.2, ease: 'none' },
      0.28
    );

    tl.fromTo(mailEl,
      { clipPath: 'inset(0 0 100% 0)' },
      { clipPath: 'inset(0 0 0% 0)', duration: 0.2, ease: 'none' },
      0.36
    );

    var pairStart = 0.22;
    var frameDur = 0.65;
    var frameY = function () { return window.innerHeight * 1.1; };
    var frameYEnd = function () { return -window.innerHeight * 1.4; };
    var dispoY = function () { return window.innerHeight * 1.1; };
    var dispoYEnd = function () { return -window.innerHeight * 1.65; };

    
    gsap.set(frame, { yPercent: -50, y: frameY });
    gsap.set(frameImg, { yPercent: -30 });

    tl.to(frame, { y: frameYEnd, duration: frameDur, ease: 'none' }, pairStart);
    tl.to(frameImg, { yPercent: 30, duration: frameDur, ease: 'none' }, pairStart);

    gsap.set(dispo, { yPercent: -50, y: dispoY, opacity: 1, clipPath: 'inset(0% 0 0% 0)' });
    tl.to(dispo, { y: dispoYEnd, duration: frameDur, ease: 'none' }, pairStart);
    tl.to(dispo, { opacity: 0, clipPath: 'inset(100% 0 0% 0)', duration: 0.15, ease: 'power2.in' }, pairStart + 0.45);

    
    gsap.set(frame2, { yPercent: -50, y: function () { return window.innerHeight * 1.3; } });
    gsap.set(frameImg2, { yPercent: -30 });

    tl.to(frame2, { y: frameYEnd, duration: frameDur, ease: 'none' }, pairStart + 0.07);
    tl.to(frameImg2, { yPercent: 30, duration: frameDur, ease: 'none' }, pairStart + 0.07);

    gsap.set(dispo2, { yPercent: -50, y: frameY, opacity: 1, clipPath: 'inset(0% 0 0% 0)' });
    tl.to(dispo2, { y: frameYEnd, duration: frameDur, ease: 'none' }, pairStart);
    tl.to(dispo2, { opacity: 0, clipPath: 'inset(100% 0 0% 0)', duration: 0.15, ease: 'power2.in' }, pairStart + 0.45);
  })();

  
  ; (function () {
    
    var POOL_EMPTY = ' ';
    var POOLS = [
      ' ',
      '·.,',
      ':;`-~^',
      '=+<>?!:;',
      '|/\\()[]{}«»',
      '÷×±≈≠≤≥∞∑∏√∫',
      '¤†‡§¶©®™°¬',
      '%&#$@¥€£¢'
    ];
    
    var seed = 42;
    function rand() { seed = (seed * 16807 + 0) % 2147483647; return seed / 2147483647; }

    function imageToAscii(img, cols) {
      seed = 42;
      var c = document.createElement('canvas');
      var ctx = c.getContext('2d');
      var aspect = img.height / img.width;
      var charAspect = 1.0;
      var rows = Math.round(cols * aspect * charAspect);
      c.width = cols; c.height = rows;
      ctx.drawImage(img, 0, 0, cols, rows);
      var data = ctx.getImageData(0, 0, cols, rows).data;
      var lines = [];
      var poolGrid = [];
      for (var y = 0; y < rows; y++) {
        var line = '';
        var poolRow = [];
        for (var x = 0; x < cols; x++) {
          var i = (y * cols + x) * 4;
          var r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
          if (a < 15) { line += ' '; poolRow.push(-1); continue; }
          var brightness = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
          brightness *= (a / 255);
          var pi = Math.floor(brightness * (POOLS.length - 1) * 0.8);
          pi = Math.min(pi, POOLS.length - 1);
          var pool = POOLS[pi];
          line += pool[Math.floor(rand() * pool.length)];
          poolRow.push(pi);
        }
        lines.push(line);
        poolGrid.push(poolRow);
      }
      return { text: lines.join('\n'), poolGrid: poolGrid };
    }

    function setupHover(preEl, poolGrid) {
      var origLines = null;
      var origGrid = null;
      var mxC = -1000, myC = -1000;
      var radius = 2.5;
      var cols = poolGrid[0] ? poolGrid[0].length : 1;
      var rows = poolGrid.length;
      var noise = [];
      var hitTime = [];
      var cellDuration = [];
      for (var ny = 0; ny < rows; ny++) {
        var nr = [], ht = [], cd = [];
        for (var nx = 0; nx < cols; nx++) {
          var h = (Math.sin(nx * 12.9898 + ny * 78.233) * 43758.5453 % 1 + 1) % 1;
          nr.push(h * 5 - 2.5);
          ht.push(0);
          cd.push(h > 0.5 ? 200 : 100);
        }
        noise.push(nr);
        hitTime.push(ht);
        cellDuration.push(cd);
      }
      var animating = false;

      function init() {
        origLines = preEl.textContent.split('\n');
        origGrid = origLines.map(function (l) { return l.split(''); });
      }

      preEl.addEventListener('mousemove', function (e) {
        if (!origGrid) init();
        var rect = preEl.getBoundingClientRect();
        var charW = rect.width / cols;
        var charH = rect.height / rows;
        mxC = (e.clientX - rect.left) / charW;
        myC = (e.clientY - rect.top) / charH;
        
        var now = performance.now();
        var maxR = radius + 3;
        var yMin = Math.max(0, Math.floor(myC - maxR));
        var yMax = Math.min(rows - 1, Math.ceil(myC + maxR));
        var xMin = Math.max(0, Math.floor(mxC - maxR));
        var xMax = Math.min(cols - 1, Math.ceil(mxC + maxR));
        for (var y = yMin; y <= yMax; y++) {
          for (var x = xMin; x <= xMax; x++) {
            var dx = x - mxC, dy = y - myC;
            if (dx * dx + dy * dy < (radius + noise[y][x]) * (radius + noise[y][x])) {
              hitTime[y][x] = now;
            }
          }
        }
        if (!animating) { animating = true; tick(); }
      });

      preEl.addEventListener('mouseleave', function () {
        mxC = -1000; myC = -1000;
      });

      function esc(ch) {
        if (ch === '<') return '&lt;';
        if (ch === '>') return '&gt;';
        if (ch === '&') return '&amp;';
        return ch;
      }

      function tick() {
        var now = performance.now();
        var anyActive = false;
        var html = '';
        for (var y = 0; y < rows; y++) {
          for (var x = 0; x < cols; x++) {
            var pi = poolGrid[y][x];
            if (pi < 0) { html += ' '; continue; }
            if (pi === 0) { html += ' '; continue; }
            var elapsed = now - hitTime[y][x];
            if (hitTime[y][x] > 0 && elapsed < cellDuration[y][x]) {
              anyActive = true;
              var idx = (POOLS.length - 1) - pi;
              var pool = POOLS[idx];
              var ch = pool[Math.floor(Math.random() * pool.length)];
              html += '<span style="color:#0a0a0a;background:#770523">' + esc(ch) + '</span>';
            } else {
              html += esc(origGrid[y][x]);
            }
          }
          html += '\n';
        }
        preEl.innerHTML = html;
        if (anyActive) {
          requestAnimationFrame(tick);
        } else {
          animating = false;
          if (origLines) preEl.textContent = origLines.join('\n');
        }
      }
    }

    function loadAndRender(src, targetId, cols) {
      var img = new Image();
      if (!isOfflineFileMode) img.crossOrigin = 'anonymous';
      img.onload = function () {
        var el = document.getElementById(targetId);
        if (el) {
          var result = imageToAscii(img, cols);
          el.textContent = result.text;
          setupHover(el, result.poolGrid);
        }
      };
      img.src = src;
    }

    var offlineAssets = window.__WORKPLAN_OFFLINE_ASSETS__ || {};
    loadAndRender(
      isOfflineFileMode && offlineAssets.footerLeft
        ? offlineAssets.footerLeft
        : 'assets/images/footer/left.png',
      'ascii-left',
      80
    );
    loadAndRender(
      isOfflineFileMode && offlineAssets.footerRight
        ? offlineAssets.footerRight
        : 'assets/images/footer/right.png',
      'ascii-right',
      80
    );

    
    var asciiLeftWrap = document.querySelector('.footer-ascii.left');
    var asciiRightWrap = document.querySelector('.footer-ascii.right');
    if (asciiLeftWrap && asciiRightWrap) {
      gsap.fromTo(asciiLeftWrap,
        { xPercent: -100 },
        {
          xPercent: 0, ease: 'none',
          scrollTrigger: {
            trigger: '#footer-transition',
            start: 'top bottom+=500',
            end: 'bottom bottom',
            scrub: true,
          }
        }
      );
      gsap.fromTo(asciiRightWrap,
        { xPercent: 100 },
        {
          xPercent: 0, ease: 'none',
          scrollTrigger: {
            trigger: '#footer-transition',
            start: 'top bottom+=500',
            end: 'bottom bottom',
            scrub: true,
          }
        }
      );
    }

    
    var asciiLeftPre = document.getElementById('ascii-left');
    var asciiRightPre = document.getElementById('ascii-right');
    var mx = 0, my = 0, sx = 0, sy = 0;
    var footerVisible = false;
    document.addEventListener('mousemove', function (e) {
      mx = (e.clientX / window.innerWidth - 0.5) * 2;
      my = (e.clientY / window.innerHeight - 0.5) * 2;
    });
    function parallaxLoop() {
      if (!footerVisible) return;
      sx += (mx - sx) * 0.05;
      sy += (my - sy) * 0.05;
      var lx = Math.min(0, sx * -15 - 15);
      var rx = Math.max(0, sx * 15 + 15);
      var py = sy * -10;
      if (asciiLeftPre) asciiLeftPre.style.transform = 'translate(' + lx + 'px, ' + py + 'px)';
      if (asciiRightPre) asciiRightPre.style.transform = 'translate(' + rx + 'px, ' + py + 'px)';
      requestAnimationFrame(parallaxLoop);
    }

    
    document.querySelectorAll('[data-chr-footer]').forEach(function (el) {
      var text = el.getAttribute('data-chr-footer');
      el.removeAttribute('data-chr-footer');
      Array.from(text).forEach(function (ch, i) {
        if (ch === ' ') {
          el.insertAdjacentHTML('beforeend', '<span style="width:0.35em;display:inline-block">&nbsp;</span>');
          return;
        }
        var wrap = document.createElement('span');
        wrap.className = 'ch-wrap';
        wrap.style.setProperty('--i', i);
        const chHTML = window.getCharHTML ? window.getCharHTML(ch) : ch;
        wrap.innerHTML = '<span class="ch-top">' + chHTML + '</span><span class="ch-bot">' + chHTML + '</span>';
        el.appendChild(wrap);
      });
    });

    
    var footerTopChars = document.querySelectorAll('#footer .footer-top .chr-hover .ch-top');
    if (footerTopChars.length) {
      gsap.set(footerTopChars, { clipPath: 'inset(100% 0 0 0)' });
      gsap.to(footerTopChars, {
        clipPath: 'inset(0 0 0 0)',
        ease: 'power3.out',
        stagger: { each: 0.015, from: 'start' },
        scrollTrigger: {
          trigger: '#footer-transition',
          start: 'center bottom+=500',
          end: 'bottom bottom',
          scrub: true,
        }
      });
    }

    
    (function () {
      function rebuildChars(el, keepFirstLetter) {
        var text = el.textContent;
        el.textContent = '';
        var inners = [];
        for (var i = 0; i < text.length; i++) {
          var outer = document.createElement('span');
          outer.style.display = 'inline-block';
          outer.style.overflow = 'hidden';
          outer.style.verticalAlign = 'top';
          outer.style.padding = '0.1em 0.3em';
          outer.style.margin = '-0.1em -0.3em';
          if (keepFirstLetter && i === 0) outer.className = 'first-letter';
          var inner = document.createElement('span');
          inner.style.display = 'inline-block';
          inner.style.willChange = 'transform';
          inner.textContent = text[i];
          outer.appendChild(inner);
          el.appendChild(outer);
          inners.push(inner);
        }
        return inners;
      }
      var lukeEl = document.querySelector('.footer-name-luke');
      var baffaitEl = document.querySelector('.footer-name-baffait');
      var dotEl = document.querySelector('.footer-name-dot');
      if (!lukeEl || !baffaitEl) return;

      var lukeChars = rebuildChars(lukeEl, true);
      var baffaitChars = rebuildChars(baffaitEl, false);
      var dotChars = dotEl ? rebuildChars(dotEl, false) : [];

      
      var ordered = [];
      var lukeRev = lukeChars.slice().reverse();
      var rightSide = baffaitChars.concat(dotChars);
      var maxLen = Math.max(lukeRev.length, rightSide.length);
      for (var i = 0; i < maxLen; i++) {
        if (rightSide[i]) ordered.push(rightSide[i]);
        if (lukeRev[i]) ordered.push(lukeRev[i]);
      }

      gsap.set(ordered, { yPercent: 110 });
      gsap.to(ordered, {
        yPercent: 0,
        ease: 'power3.out',
        stagger: { each: 0.04, from: 'start' },
        scrollTrigger: {
          trigger: '#footer-transition',
          start: 'center bottom+=500',
          end: 'bottom bottom',
          scrub: true,
        }
      });
    })();

    
    var footerEl = document.getElementById('footer');
    ScrollTrigger.create({
      trigger: '#footer-transition',
      start: 'top bottom+=500',
      end: 'bottom bottom',
      onEnter: function () { footerEl.style.visibility = 'visible'; footerVisible = true; parallaxLoop(); },
      onLeave: function () { },
      onEnterBack: function () { footerVisible = true; parallaxLoop(); },
      onLeaveBack: function () { footerEl.style.visibility = 'hidden'; footerVisible = false; },
    });

    
    var contactPin = document.getElementById('contact-pin');
    var contactBlobWrap = document.getElementById('contact-blob-wrap');
    var contactBgEl = document.getElementById('contact-bg');
    var contactSection = document.getElementById('contact');
    var ctTitle = document.getElementById('contact-title');
    var ctSocials = document.getElementById('contact-socials');
    var ctMail = document.getElementById('contact-mail');

    var ftl = gsap.timeline({
      scrollTrigger: {
        trigger: '#footer-transition',
        start: 'top bottom+=550',
        end: 'bottom bottom',
        scrub: true,
        onUpdate: function (self) {
          var p = self.progress;
          if (p > 0.2) {
            contactBgEl.style.display = 'none';
            contactSection.style.pointerEvents = 'none';
          } else {
            contactBgEl.style.display = 'block';
            contactSection.style.pointerEvents = '';
          }
        }
      }
    });

    ftl.set(contactBlobWrap, {
      height: '110vh', overflow: 'hidden',
      borderRadius: '0 0 0px 0px'
    }, 0);

    ftl.to(contactBlobWrap, {
      borderRadius: '0 0 50px 50px',
      duration: 0.15, ease: 'power2.out'
    }, 0);

    ftl.to(contactBlobWrap, {
      y: function () { return -(window.innerHeight * 1.8 + 400); },
      immediateRender: false,
      duration: 1.0, ease: 'none'
    }, 0);

    ftl.to(contactPin, {
      y: '-40vh', pointerEvents: 'none', immediateRender: false,
      duration: 1.0, ease: 'none'
    }, 0);

    ftl.fromTo([ctSocials, ctMail],
      { clipPath: 'inset(0 0 0% 0)' },
      { clipPath: 'inset(0 0 100% 0)', duration: 0.1, ease: 'none' },
      0
    );
    ftl.fromTo(ctTitle,
      { clipPath: 'inset(0 0 0% 0)' },
      { clipPath: 'inset(0 0 100% 0)', duration: 0.25, ease: 'power2.in' },
      0
    );
  })();

  
  const PROJECTS = {
    'cyberdiag': {
      desc: "围绕喂养、睡眠、成长记录、设备使用、家庭协同、社区互动等关键母婴场景，提升用户体验的清晰度、易用性、可信度和情感连接，让产品从“功能可用”走向“体验好用”。",
      category: '价值定位', year: 'VALUE 01', tags: ['业务体验', '关键场景', '情感连接'],
      images: ['assets/images/projects/CyberDiagWebsite/momcozy-product-family.jpg'],
    },
    'anima': {
      desc: "承接公司智能化和个性化方向，探索 AI 在 App 中的角色定位、交互方式、内容表达和服务边界，让 AI 能够真正帮助用户理解信息、降低焦虑、提升效率，而不是停留在功能叠加。",
      category: '价值定位', year: 'VALUE 02', tags: ['AI 体验', '个性化', '服务边界'],
      images: ['assets/images/projects/Anima/ai-sleep-prediction.png'],
    },
    'cyberdiag-app': {
      desc: "建立 Design System、Design Token、组件规范、暗黑模式、多端适配、交付模板等设计基础能力，提升 App、硬件屏幕、AI 服务、社区和运营场景中的体验一致性。",
      category: '价值定位', year: 'VALUE 03', tags: ['Design System', 'Token', '一致性'],
      images: ['assets/images/projects/Covers/system-experience-momcozy.jpg'],
    },
    'zenith': {
      desc: "围绕 App、AI、IoT、社区等核心体验升级，明确产品体验方向，提升关键场景设计质量，并形成可复用的体验判断标准。",
      category: '关键战役', year: 'BATTLE 01', tags: ['App 3.1', 'Journal', '社区', 'IoT'],
      images: ['assets/images/projects/Zenith/image1.png', 'assets/images/projects/Zenith/image2.png', 'assets/images/projects/Zenith/image3.png'],
    },
    'skymcdb': {
      desc: "建立设计需求分级、设计评审、设计交付、研发还原、上线验收和复盘机制，让设计工作从“依赖个人经验”逐步走向“标准化、可协作、可复盘”的组织能力。",
      category: '价值定位', year: 'VALUE 04', tags: ['标准化', '协作机制', '复盘沉淀'],
      images: ['assets/images/projects/Covers/momcozy-app-3-ui-design.png'],
    },
    'chromablock': {
      desc: "围绕 agency 时域融合版本 630，推进底层系统与前台体验一致性建设，通过 Token、组件、状态规则、暗黑模式和多端适配形成可维护的设计基线。",
      category: '关键战役', year: 'BATTLE 03', tags: ['agency 630', '暗黑模式', '组件状态'],
      images: ['assets/images/projects/chromablock/image1.png', 'assets/images/projects/chromablock/image2.png', 'assets/images/projects/chromablock/image3.png'],
    },
    'symphony': {
      desc: "建立团队 1v1、设计评审圆桌、项目复盘和 AI 辅助设计工作流试点，把项目经验沉淀为规范、模板、案例和 AI 可调用上下文。",
      category: '关键战役', year: 'BATTLE 04', tags: ['学习型组织', 'AI 工作流', '复盘机制'],
      images: ['assets/images/projects/symphony/image2.png', 'assets/images/projects/symphony/image.png', 'assets/images/projects/symphony/image3.png'],
    },
    'echo': {
      desc: "用关键项目按时交付率、设计评审覆盖率、上线前设计验收、Design Token 初版、AI 工作流试点和主责设计师机制来衡量阶段成果。",
      category: '绩效指标', year: 'METRICS', tags: ['交付质量', '体验质量', '体系沉淀'],
      images: ['assets/images/projects/echo/image.png'],
    },
  };

  const detailEl = document.getElementById('project-detail');
  const detailTitle = document.getElementById('detail-title');
  const detailTitleWrap = document.getElementById('detail-title-wrap');
  const detailYear = document.getElementById('detail-year');
  const detailDesc = document.getElementById('detail-desc');
  const detailTags = document.getElementById('detail-tags');
  const detailThumbs = document.getElementById('detail-thumbs');
  const detailThumbsInner = document.getElementById('detail-thumbs-inner');
  const detailSelected = document.getElementById('detail-selected');
  const detailGalleryWrap = document.getElementById('detail-gallery-wrap');
  const flyingTitle = document.getElementById('flying-title');
  const pageFade = document.getElementById('page-fade');
  const detailBack = document.getElementById('detail-back');

  let projectOpen = false;
  window._projectOpen = false;
  let _flyingSourceItem = null;
  let _galleryRAF = null;
  let _galleryY = 0, _galleryMaxScroll = 0;
  let _qGalleryY = null;

  let _activeThumbIdx = -1;
  let _thumbImgs = []; 

  
  function updateActiveThumb() {
    if (!projectOpen) return;
    if (!_thumbImgs.length) { _galleryRAF = requestAnimationFrame(updateActiveThumb); return; }
    var thumbsRect = detailThumbs.getBoundingClientRect();
    var cy = thumbsRect.top + thumbsRect.height / 2;
    var closestIdx = 0, closestDist = Infinity;
    for (var i = 0; i < _thumbImgs.length; i++) {
      var rect = _thumbImgs[i].getBoundingClientRect();
      var imgCy = rect.top + rect.height / 2;
      var dist = Math.abs(imgCy - cy);
      if (dist < closestDist) { closestDist = dist; closestIdx = i; }
      var distNorm = dist / (thumbsRect.height * 0.45);
      var t = Math.max(0, 1 - distNorm);
      t = t * t * t;
      _thumbImgs[i].style.width = (100 + t * 40) + '%';
    }
    if (closestIdx !== _activeThumbIdx) {
      if (_activeThumbIdx >= 0 && _thumbImgs[_activeThumbIdx]) _thumbImgs[_activeThumbIdx].classList.remove('active');
      _thumbImgs[closestIdx].classList.add('active');
      _activeThumbIdx = closestIdx;
      if (_cachedSelImg) {
        _cachedSelImg.src = _thumbImgs[closestIdx].src;
      }
    }
    _galleryRAF = requestAnimationFrame(updateActiveThumb);
  }

  function openProject(id, clickedItem) {
    const proj = PROJECTS[id];
    if (!proj || projectOpen) return;
    projectOpen = true; window._projectOpen = true;
    _flyingSourceItem = clickedItem;

    history.pushState({ project: id }, '', '#' + id);
    lenis.stop();

    const stTimeline = document.getElementById('scroll-timeline');
    const pctEl = document.getElementById('scroll-pct');
    if (stTimeline) stTimeline.style.setProperty('display', 'none', 'important');
    if (pctEl) pctEl.style.setProperty('display', 'none', 'important');

    const rect = clickedItem.getBoundingClientRect();
    const cs = getComputedStyle(clickedItem);
    const startFontSize = parseFloat(cs.fontSize);
    flyingTitle.textContent = clickedItem.textContent;
    flyingTitle.style.fontSize = startFontSize + 'px';
    flyingTitle.style.lineHeight = cs.lineHeight;
    flyingTitle.style.letterSpacing = cs.letterSpacing;
    flyingTitle.style.paddingTop = cs.paddingTop;
    flyingTitle.style.paddingBottom = cs.paddingBottom;

    
    gsap.set(flyingTitle, { left: rect.left, top: rect.top, opacity: 1, scale: 1, x: 0, y: 0, transformOrigin: 'left top' });

    
    clickedItem.style.visibility = 'hidden';

    
    detailTitle.textContent = clickedItem.textContent;
    detailYear.textContent = proj.year;
    detailDesc.textContent = proj.desc;
    detailTags.innerHTML = proj.tags.map(function (t) { return '<span class="detail-tag">' + t + '</span>'; }).join('');
    
    var allImages = [clickedItem.dataset.img].concat(proj.images);
    detailThumbsInner.innerHTML = allImages.map(function (src) { return '<img src="' + src + '" alt="" decoding="async">'; }).join('');
    detailSelected.innerHTML = '<img src="' + allImages[0] + '" alt="" decoding="async">';
    detailThumbsInner.querySelectorAll('img').forEach(function (img, i) {
      if (img.decode) img.decode().catch(function () { });
      
      img.addEventListener('click', function () {
        if (_activeThumbIdx >= 0 && _thumbImgs[_activeThumbIdx]) _thumbImgs[_activeThumbIdx].classList.remove('active');
        img.classList.add('active');
        _activeThumbIdx = i;
        if (_cachedSelImg) _cachedSelImg.src = img.src;
      });
    });
    _activeThumbIdx = 0;
    _thumbImgs = [].slice.call(detailThumbsInner.querySelectorAll('img'));
    _thumbImgs[0].classList.add('active');
    _cachedSelImg = detailSelected.querySelector('img');
    _galleryY = 0;
    gsap.set(detailThumbsInner, { y: 0 });

    
    var remPx = parseFloat(getComputedStyle(document.documentElement).fontSize);
    var targetTop = window.innerHeight * 0.22;
    var targetLeft = remPx * 4;
    var targetFontSize = Math.min(Math.max(window.innerWidth * 0.05, remPx * 3), remPx * 5);

    var tl = gsap.timeline();

    
    tl.to(pageFade, { opacity: 1, duration: 0.8, ease: 'power2.inOut' }, 0);

    
    tl.to(flyingTitle, { top: targetTop, left: targetLeft, fontSize: targetFontSize, paddingTop: 0, paddingBottom: 0, duration: 1, ease: 'power3.inOut' }, 0.3);

    
    tl.to(detailEl, { opacity: 1, duration: 0.4, ease: 'power2.out', onStart: function () { detailEl.classList.add('active'); } }, 1.0);

    
    tl.set(flyingTitle, { opacity: 0 }, 1.1);
    tl.set(detailTitleWrap, { opacity: 1 }, 1.1);

    
    tl.to(detailDesc, { opacity: 1, duration: 0.6, ease: 'power2.out' }, 1.2);
    tl.to(detailTags, { opacity: 1, duration: 0.5, ease: 'power2.out' }, 1.3);
    tl.to(detailBack, { opacity: 1, duration: 0.5, ease: 'power2.out' }, 1.3);

    
    tl.fromTo(detailGalleryWrap, { opacity: 0 }, { opacity: 1, duration: 0.8, ease: 'power3.out' }, 1.2);

    
    tl.add(function () {
      _galleryMaxScroll = Math.max(0, detailThumbsInner.scrollHeight - detailThumbs.clientHeight);
      _qGalleryY = gsap.quickTo(detailThumbsInner, 'y', { duration: 0.8, ease: 'power2.out' });
      _galleryRAF = requestAnimationFrame(updateActiveThumb);
    });
  }

  function closeProject() {
    if (!projectOpen) return;
    projectOpen = false; window._projectOpen = false;
    if (_galleryRAF) { cancelAnimationFrame(_galleryRAF); _galleryRAF = null; }
    _qGalleryY = null;
    history.pushState(null, '', window.location.pathname);

    const stTimeline = document.getElementById('scroll-timeline');
    const pctEl = document.getElementById('scroll-pct');
    if (stTimeline) stTimeline.style.removeProperty('display');
    if (pctEl) pctEl.style.removeProperty('display');

    var tl = gsap.timeline();

    
    tl.to([detailDesc, detailTags, detailBack], { opacity: 0, duration: 0.3, ease: 'power2.in' }, 0);
    tl.to(detailGalleryWrap, { opacity: 0, duration: 0.4, ease: 'power2.in' }, 0);

    
    var dtRect = detailTitle.getBoundingClientRect();
    var dtCs = getComputedStyle(detailTitle);
    flyingTitle.textContent = detailTitle.textContent;
    flyingTitle.style.fontSize = dtCs.fontSize;
    flyingTitle.style.lineHeight = dtCs.lineHeight;
    flyingTitle.style.letterSpacing = dtCs.letterSpacing;
    flyingTitle.style.paddingTop = '0';
    flyingTitle.style.paddingBottom = '0';
    gsap.set(flyingTitle, { left: dtRect.left, top: dtRect.top, opacity: 1, x: 0, y: 0 });
    gsap.set(detailTitleWrap, { opacity: 0 });

    
    tl.to(detailEl, { opacity: 0, duration: 0.4, ease: 'power2.in' }, 0.2);

    
    if (_flyingSourceItem) {
      var itemRect = _flyingSourceItem.getBoundingClientRect();
      var itemCs = getComputedStyle(_flyingSourceItem);
      tl.to(flyingTitle, {
        left: itemRect.left,
        top: itemRect.top,
        fontSize: parseFloat(itemCs.fontSize),
        paddingTop: itemCs.paddingTop,
        paddingBottom: itemCs.paddingBottom,
        duration: 0.9,
        ease: 'power3.inOut',
      }, 0.3);
    }

    
    tl.to(pageFade, { opacity: 0, duration: 0.6, ease: 'power2.out' }, 0.5);

    
    tl.add(function () {
      detailEl.classList.remove('active');
      gsap.set([detailTitleWrap, detailDesc, detailTags, detailBack, detailGalleryWrap], { opacity: 0 });
      gsap.set(flyingTitle, { opacity: 0 });
      _activeThumbIdx = -1;
      _thumbImgs = [];
      _cachedSelImg = null;
      if (_flyingSourceItem) {
        _flyingSourceItem.style.visibility = '';
        _flyingSourceItem = null;
      }
      lenis.start();
      ScrollTrigger.refresh();
    });
  }


  detailEl.addEventListener('wheel', function (e) {
    if (!projectOpen) return;
    e.preventDefault();
    var delta = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
    _galleryY = Math.max(-_galleryMaxScroll, Math.min(0, _galleryY - delta));
    if (_qGalleryY) _qGalleryY(_galleryY);
  }, { passive: false });


  var _detailTouchStartY = 0;
  detailEl.addEventListener('touchstart', function (e) {
    if (!projectOpen) return;
    _detailTouchStartY = e.touches[0].clientY;
  }, { passive: true });
  detailEl.addEventListener('touchmove', function (e) {
    if (!projectOpen) return;
    e.preventDefault();
    var y = e.touches[0].clientY;
    var delta = _detailTouchStartY - y;
    _detailTouchStartY = y;
    _galleryY = Math.max(-_galleryMaxScroll, Math.min(0, _galleryY - delta));
    if (_qGalleryY) _qGalleryY(_galleryY);
  }, { passive: false });

  
  detailBack.addEventListener('click', closeProject);
  window.addEventListener('popstate', function () { if (projectOpen) closeProject(); });

  
  function preloadProjectImages() {
    var allSrcs = [];
    
    items.forEach(function (item) { if (item.dataset.img) allSrcs.push(item.dataset.img); });
    
    Object.keys(PROJECTS).forEach(function (id) {
      var imgs = PROJECTS[id].images;
      if (imgs) allSrcs = allSrcs.concat(imgs);
    });
    
    var seen = {};
    allSrcs = allSrcs.filter(function (s) { if (seen[s]) return false; seen[s] = true; return true; });
    
    var idx = 0, batch = 2;
    function loadBatch() {
      for (var j = 0; j < batch && idx < allSrcs.length; j++, idx++) {
        var img = new Image();
        img.decoding = 'async';
        img.src = allSrcs[idx];
      }
      if (idx < allSrcs.length) {
        if (window.requestIdleCallback) requestIdleCallback(loadBatch);
        else setTimeout(loadBatch, 200);
      }
    }
    if (window.requestIdleCallback) requestIdleCallback(loadBatch);
    else setTimeout(loadBatch, 2000);
  }
  
  setupEditorialMotionReveals();
  setTimeout(preloadProjectImages, 4000);
}

let editorialRevealSetup = false;
function setupEditorialMotionReveals() {
  if (editorialRevealSetup || prefersReducedMotion) return;
  editorialRevealSetup = true;

  const sectionHeadTargets = gsap.utils.toArray([
    '#team-structure .team-eyebrow',
    '#team-structure .team-hero h2',
    '#team-structure .team-intro p',
    '#team-structure .team-block h3',
    '#strategy .strategy-eyebrow',
    '#strategy .strategy-hero h2',
    '#strategy .strategy-summary p',
    '#strategy .strategy-block h3',
    '#awards .awards-title',
    '#awards .awards-intro',
    '#awards .awards-module-head',
    '#performance .performance-eyebrow',
    '#performance .performance-hero h2',
    '#performance .performance-summary p',
    '#performance .performance-page-head',
    '#design-plan .design-plan-head',
  ].join(',')).filter(Boolean);

  sectionHeadTargets.forEach(function (el) {
    gsap.fromTo(el,
      { opacity: 0, y: 42, clipPath: 'inset(0 0 100% 0)' },
      {
        opacity: 1,
        y: 0,
        clipPath: 'inset(0 0 0% 0)',
        ease: 'none',
        scrollTrigger: {
          trigger: el,
          start: 'top 88%',
          end: 'top 66%',
          scrub: 0.45,
        },
      }
    );
  });

  const rowTargets = gsap.utils.toArray([
    '#team-structure .language-item',
    '#team-structure .team-card',
    '#team-structure .team-goals li',
    '#strategy .strategy-card',
    '#strategy .strategy-map-list .language-item',
    '#strategy .strategy-priority',
    '#awards .award-item',
    '#team-battle-map .battle-map-intro',
    '#team-battle-map .battle-pillar',
    '#team-battle-map .battle-base',
    '#team-battle-map .battle-stream',
    '#performance .performance-align article',
    '#performance .performance-metric',
    '#design-plan .design-plan-lane',
    '#design-plan .design-plan-item',
  ].join(',')).filter(Boolean);

  rowTargets.forEach(function (el) {
    gsap.fromTo(el,
      { opacity: 0, y: 48, filter: 'blur(12px)' },
      {
        opacity: 1,
        y: 0,
        filter: 'blur(0px)',
        ease: 'none',
        scrollTrigger: {
          trigger: el,
          start: 'top 92%',
          end: 'top 70%',
          scrub: 0.5,
        },
      }
    );
  });
}

ScrollTrigger.refresh();

function resetCrossPageTransitionState() {
  var workOverlay = document.getElementById('work-transition-overlay');
  var workFlyText = document.getElementById('work-flying-text');
  var pageFadeEl = document.getElementById('page-fade');
  var flyingTitleEl = document.getElementById('flying-title');

  if (workOverlay) {
    gsap.killTweensOf(workOverlay);
    gsap.set(workOverlay, { opacity: 0 });
    workOverlay.style.pointerEvents = 'none';
  }

  if (workFlyText) {
    gsap.killTweensOf(workFlyText);
    gsap.set(workFlyText, { opacity: 0, x: 0, y: 0, xPercent: 0, yPercent: 0 });
    workFlyText.textContent = '规划';
  }

  if (pageFadeEl) {
    gsap.killTweensOf(pageFadeEl);
    gsap.set(pageFadeEl, { opacity: 0 });
  }

  if (flyingTitleEl) {
    gsap.killTweensOf(flyingTitleEl);
    gsap.set(flyingTitleEl, { opacity: 0, x: 0, y: 0 });
  }
}

function playIndexReturnFadeIn() {
  var pageFadeEl = document.getElementById('page-fade');
  if (!pageFadeEl) return;
  gsap.killTweensOf(pageFadeEl);
  pageFadeEl.style.pointerEvents = 'none';
  pageFadeEl.style.opacity = '1';
  requestAnimationFrame(function () {
    gsap.to(pageFadeEl, { opacity: 0, duration: 0.65, ease: 'power2.out' });
  });
}

function handleIndexPageShow(e) {
  var hasReturnFlag = !!sessionStorage.getItem('index-return-fade');
  if (hasReturnFlag) sessionStorage.removeItem('index-return-fade');

  var isBfcacheRestore = !!(e && e.persisted);

  resetCrossPageTransitionState();

  _isPageTransitioning = false;
  document.querySelectorAll('a[data-page-link]').forEach(function (el) {
    el.style.visibility = '';
  });

  if (isBfcacheRestore) {
    
    
    _forceScrollTop();
    if (lenis) lenis.scrollTo(0, { immediate: true });
    ScrollTrigger.refresh();
  }

  if (hasReturnFlag || isBfcacheRestore) {
    playIndexReturnFadeIn();
  }
}

window.addEventListener('pageshow', handleIndexPageShow);

document.addEventListener('visibilitychange', function () {
  if (document.hidden) return;
  if (master && master.progress() < 1) master.progress(1);
});

let _isPageTransitioning = false;

function runPageTransition(linkEl, label, sessionKey, href) {
  if (!linkEl || _isPageTransitioning) return;
  if (window._projectOpen) return;

  const overlay = document.getElementById('work-transition-overlay');
  const flyText = document.getElementById('work-flying-text');
  if (!overlay || !flyText) return;

  _isPageTransitioning = true;

  
  linkEl.style.visibility = 'hidden';

  const rect = linkEl.getBoundingClientRect();
  flyText.textContent = label;

  gsap.killTweensOf([overlay, flyText]);
  gsap.set(overlay, { opacity: 0 });
  gsap.set(flyText, {
    left: rect.left,
    top: rect.top,
    fontSize: getComputedStyle(linkEl).fontSize,
    opacity: 1,
    xPercent: 0,
    yPercent: 0,
    x: 0,
    y: 0,
  });

  const tl = gsap.timeline();

  tl.to(overlay, { opacity: 1, duration: 0.7, ease: 'power2.inOut' }, 0);

  tl.to(flyText, {
    left: '3rem',
    top: '3rem',
    xPercent: 0,
    yPercent: 0,
    fontSize: 'clamp(2.5rem, 5vw, 4.5rem)',
    duration: 1,
    ease: 'power3.inOut',
  }, 0.2);

  tl.add(() => {
    sessionStorage.setItem(sessionKey, '1');
    window.location.href = href;
  }, 1.3);
}

const PAGE_LINK_ROUTES = {
  work: { label: '价值', sessionKey: 'work-transition', href: '#projects' },
  info: { label: '目录', sessionKey: 'info-transition', href: '#about' },
  contact: { label: '交流', sessionKey: 'contact-transition', href: '#contact' },
};

function resolvePageRoute(linkEl) {
  if (!linkEl) return null;
  const routeKey = linkEl.getAttribute('data-page-link');
  return PAGE_LINK_ROUTES[routeKey] || null;
}

document.querySelectorAll('a[data-page-link]').forEach(function (linkEl) {
  const route = resolvePageRoute(linkEl);
  if (!route) return;

  const rawHref = (linkEl.getAttribute('href') || '').trim();
  if (!rawHref || rawHref === '#') {
    linkEl.setAttribute('href', route.href);
  }
});

document.addEventListener('click', function (e) {
  if (e.defaultPrevented) return;
  if (e.button !== 0) return;
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

  const target = e.target;
  if (!(target instanceof Element)) return;

  const linkEl = target.closest('a[data-page-link]');
  if (!linkEl) return;

  const route = resolvePageRoute(linkEl);
  if (!route) return;

  e.preventDefault();
  runPageTransition(linkEl, route.label, route.sessionKey, route.href);
}, true);

// --- AWARDS LOGIC ---
document.addEventListener("DOMContentLoaded", () => {
  const awardItems = gsap.utils.toArray('.award-item');
  if (awardItems.length > 0) {
    // ScrollTrigger to highlight the line closest to the center
    awardItems.forEach(item => {
      ScrollTrigger.create({
        trigger: item,
        start: "top center+=15%", // adjust triggers so they catch the line better
        end: "bottom center-=15%",
        toggleClass: { targets: item, className: "active-award" }
      });
    });

  }
});
