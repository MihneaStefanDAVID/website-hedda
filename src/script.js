(() => {
  "use strict";

  const scene = document.getElementById("hero-project-transition");
  const stage = scene ? scene.querySelector(".sticky-stage") : null;
  const rects = scene ? [...scene.querySelectorAll(".mark-rect")] : [];
  const cards = scene ? [...scene.querySelectorAll("#project-grid .project-card")] : [];
  const scrollHint = scene ? scene.querySelector(".scroll-hint") : null;

  if (!scene || !stage || rects.length !== 4 || cards.length !== 4) return;

  const images = cards.map((card) => card.querySelector(".project-card__image"));

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ------------------------------------------------------------------
  // CONFIG — every timing range and easing lives here so the animation
  // can be re-tuned without touching the render logic below.
  //
  // The whole sequence is built from ONE easing family (cubic) so nothing
  // ever visibly decelerates to a stop and re-accelerates mid-gesture —
  // the only true zero-velocity moment is the intentional compact hold.
  // ------------------------------------------------------------------
  const CONFIG = {
    // Normalized scroll-progress ranges (0 = top of scene, 1 = bottom).
    // Gather covers the logo's "very subtle preparation" too: it's a single
    // continuous ease-in-out curve, so the first sliver of it (~0–0.14) is
    // naturally slow and reads as a nudge rather than a separate motion.
    gather: [0.0, 0.42], // all four rectangles travel to the compact center state
    // 0.42–0.52 is a deliberate hold: gather has finished, morph hasn't started.
    morph: [0.52, 0.86], // rectangles travel outward to the measured card boxes
    cardReveal: [0.68, 0.93], // project images reveal via clip-path from the center
    frameFade: [0.82, 0.96], // outline fades out only after the image is visible
    compactHold: [0.42, 0.52], // window for the optional subtle scale pulse
    pulseAmount: 0.02, // max 2% — must stay imperceptible and axis-aligned
    hintFade: [0.0, 0.06], // the "scroll" hint should disappear almost immediately
    // Exponential damping applied to raw scroll progress before rendering —
    // still 100% scroll-position-driven (it converges on the real target,
    // never drifts on its own), just smoothed so wheel/trackpad jitter
    // doesn't read as stepped motion.
    smoothing: 0.16,
  };

  // ------------------------------------------------------------------
  // Logo geometry — traced from 00_logo-1.pdf (four stroked rectangles,
  // vector-extracted). Values are in PDF point units, relative to the
  // mark's own bounding-box center, so they can be scaled uniformly
  // without ever redrawing/reinterpreting the source shape.
  // ------------------------------------------------------------------
  const BASE_MARK_HEIGHT = 477.32; // full mark bbox height in source units
  const BASE_RECTS = [
    { x: -58.94, y: -238.66, width: 206.95, height: 169.64 }, // top
    { x: 93.44, y: -140.91, width: 112.13, height: 304.81 }, // right
    { x: -58.94, y: 109.28, width: 206.96, height: 129.38 }, // bottom
    { x: -205.58, y: -140.91, width: 201.27, height: 304.73 }, // left
  ];

  // ------------------------------------------------------------------
  // Math helpers — a single cubic easing family used everywhere.
  // ------------------------------------------------------------------
  const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
  const lerp = (start, end, t) => start + (end - start) * t;
  const mapRange = (value, start, end) => clamp((value - start) / (end - start));
  const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

  function interpolateState(from, to, t) {
    return {
      x: lerp(from.x, to.x, t),
      y: lerp(from.y, to.y, t),
      width: lerp(from.width, to.width, t),
      height: lerp(from.height, to.height, t),
    };
  }

  // ------------------------------------------------------------------
  // Responsive state — recomputed on load / resize / orientation change.
  // ------------------------------------------------------------------
  let initialStates = [];
  let compactStates = [];
  let cardTargets = [];

  function getMarkMetrics() {
    const targetHeight = clamp(window.innerHeight * 0.4, 200, 380);
    const markScale = targetHeight / BASE_MARK_HEIGHT;
    const compactSize = targetHeight * 0.3;
    return { markScale, compactSize };
  }

  function measure() {
    const { markScale, compactSize } = getMarkMetrics();

    initialStates = BASE_RECTS.map((r) => ({
      x: r.x * markScale,
      y: r.y * markScale,
      width: r.width * markScale,
      height: r.height * markScale,
    }));

    const compact = {
      x: -compactSize / 2,
      y: -compactSize / 2,
      width: compactSize,
      height: compactSize,
    };
    compactStates = [compact, compact, compact, compact];

    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;

    // The cards carry their own reveal transform (translateY + scale), which
    // getBoundingClientRect() reports post-transform — measuring while that's
    // applied would target the reveal-in-progress box, not the card's true
    // resting position. Neutralize it for the instant of measurement only.
    cardTargets = cards.map((card) => {
      const previousTransform = card.style.transform;
      card.style.transform = "none";
      const r = card.getBoundingClientRect();
      card.style.transform = previousTransform;
      return {
        x: r.left - centerX,
        y: r.top - centerY,
        width: r.width,
        height: r.height,
      };
    });
  }

  // ------------------------------------------------------------------
  // Render — pure function of (smoothed) scroll progress. No time-based
  // motion: at rest the function is called with a fixed progress and
  // produces a fixed frame.
  // ------------------------------------------------------------------
  function render(progress) {
    const gatherT = easeInOutCubic(mapRange(progress, CONFIG.gather[0], CONFIG.gather[1]));
    const morphT = easeInOutCubic(mapRange(progress, CONFIG.morph[0], CONFIG.morph[1]));

    const holdT = mapRange(progress, CONFIG.compactHold[0], CONFIG.compactHold[1]);
    const pulse = 1 + Math.sin(holdT * Math.PI) * CONFIG.pulseAmount;

    const frameOpacity = 1 - easeOutCubic(mapRange(progress, CONFIG.frameFade[0], CONFIG.frameFade[1]));

    rects.forEach((rect, i) => {
      let state = interpolateState(initialStates[i], compactStates[i], gatherT);
      state = interpolateState(state, cardTargets[i], morphT);

      // Uniform, centered scale pulse — width/height only, never a transform
      // rotation, so every edge stays axis-aligned.
      const dw = state.width * (pulse - 1);
      const dh = state.height * (pulse - 1);
      const x = state.x - dw / 2;
      const y = state.y - dh / 2;
      const width = state.width + dw;
      const height = state.height + dh;

      rect.style.width = `${width}px`;
      rect.style.height = `${height}px`;
      rect.style.transform = `translate(${x}px, ${y}px)`;
      rect.style.opacity = frameOpacity;
    });

    const cardRevealT = easeOutCubic(mapRange(progress, CONFIG.cardReveal[0], CONFIG.cardReveal[1]));
    const inset = lerp(46, 0, cardRevealT);
    const translateY = lerp(40, 0, cardRevealT);
    const cardScale = lerp(0.985, 1, cardRevealT);
    const imageScale = lerp(1.06, 1, cardRevealT);

    cards.forEach((card, i) => {
      card.style.opacity = cardRevealT;
      card.style.transform = `translateY(${translateY}px) scale(${cardScale})`;
      card.style.clipPath = `inset(${inset}% ${inset}% ${inset}% ${inset}%)`;
      images[i].style.transform = `scale(${imageScale})`;
    });

    if (scrollHint) {
      scrollHint.style.opacity = 1 - easeOutCubic(mapRange(progress, CONFIG.hintFade[0], CONFIG.hintFade[1]));
    }
  }

  // ------------------------------------------------------------------
  // Scroll progress, damped toward the target each frame, with a
  // requestAnimationFrame loop that runs only while it's still converging.
  // ------------------------------------------------------------------
  let targetProgress = 0;
  let renderedProgress = 0;
  let rafId = null;
  const SETTLE_EPSILON = 0.0002;

  function currentProgress() {
    const sceneRect = scene.getBoundingClientRect();
    const scrollDistance = scene.offsetHeight - window.innerHeight;
    if (scrollDistance <= 0) return 0;
    return clamp(-sceneRect.top / scrollDistance);
  }

  function tick() {
    const delta = targetProgress - renderedProgress;
    if (Math.abs(delta) < SETTLE_EPSILON) {
      renderedProgress = targetProgress;
      render(renderedProgress);
      renderDebug();
      rafId = null;
      return;
    }
    renderedProgress += delta * CONFIG.smoothing;
    render(renderedProgress);
    renderDebug();
    rafId = requestAnimationFrame(tick);
  }

  function requestTick() {
    if (rafId === null) rafId = requestAnimationFrame(tick);
  }

  function onScroll() {
    targetProgress = currentProgress();
    requestTick();
  }

  function onResize() {
    measure();
    targetProgress = currentProgress();
    renderedProgress = targetProgress; // snap on resize — no re-animating in
    render(renderedProgress);
    renderDebug();
  }

  if (reducedMotion) {
    // The CSS reduced-motion query already unpins the scene and shows the
    // grid at rest — nothing to compute or animate.
    return;
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onResize);
  window.addEventListener("orientationchange", onResize);
  window.addEventListener("load", onResize);
  document.fonts?.ready.then(onResize).catch(() => {});

  measure();
  targetProgress = currentProgress();
  renderedProgress = targetProgress;
  render(renderedProgress);

  // ------------------------------------------------------------------
  // Debug mode — visualizes the measured card target bounding boxes.
  // Toggle with the "d" key, or load the page with ?debug in the URL.
  // ------------------------------------------------------------------
  let debugOn = new URLSearchParams(location.search).has("debug");
  const debugEls = cards.map(() => {
    const el = document.createElement("div");
    el.className = "debug-target";
    el.style.display = "none";
    document.body.appendChild(el);
    return el;
  });

  function renderDebug() {
    if (!debugOn) return;
    cards.forEach((card, i) => {
      const r = card.getBoundingClientRect();
      const el = debugEls[i];
      el.style.display = "block";
      el.style.left = `${r.left}px`;
      el.style.top = `${r.top}px`;
      el.style.width = `${r.width}px`;
      el.style.height = `${r.height}px`;
    });
  }

  window.addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() !== "d") return;
    debugOn = !debugOn;
    debugEls.forEach((el) => (el.style.display = debugOn ? "block" : "none"));
    renderDebug();
  });

  if (debugOn) renderDebug();
})();
