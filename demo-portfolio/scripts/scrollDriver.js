// scrollDriver.js
export const Driver = (() => {
  const state = {
    chapters: [],
    vh: 0, lastY: 0, lastT: 0, velocity: 0,
    currentIdx: 0, enteredAt: 0,
    prm: window.matchMedia('(prefers-reduced-motion: reduce)').matches
  };

  const clamp = (v, a=0, b=1) => Math.min(b, Math.max(a, v));
  const expK = (dt, tau) => 1 - Math.exp(-dt / tau);

  function setHeights() {
    document.querySelectorAll('.chapter').forEach(el => {
      const h = parseFloat(el.getAttribute('data-h'));
      if (!isNaN(h)) el.style.height = h + 'vh';
    });
  }

  function measure() {
    state.vh = window.innerHeight;
    setHeights();
    state.chapters = [...document.querySelectorAll('.chapter')].map((el, idx) => {
      const rectTop = el.getBoundingClientRect().top;
      const top = window.scrollY + rectTop;
      const height = el.offsetHeight;
      const dur = Math.max(1, height - state.vh);
      return { el, idx, top, height, dur, p:0, pLag:0, entered:false, way:{'0.2':false,'0.5':false,'0.8':false} };
    });
  }

  function currentChapterIndex(scrollY) {
    const arr = state.chapters;
    for (let i=arr.length-1; i>=0; i--) if (scrollY >= arr[i].top - 1) return i;
    return 0;
  }

  function step(now) {
    const scrollY = window.scrollY || document.documentElement.scrollTop;
    const dt = Math.max(0.001, (now - (state.lastT||now)) / 1000);
    const dy = scrollY - state.lastY;
    const instVel = dy / Math.max(0.001, (now - (state.lastT||now))); // px/ms approx
    state.velocity = 0.9*state.velocity + 0.1*instVel;

    for (const ch of state.chapters) {
      const y = scrollY - ch.top;
      const p = clamp(y / ch.dur);
      const tau = 0.12; // seconds
      const k = expK(dt, tau);
      ch.p = p;
      ch.pLag += (p - ch.pLag) * (state.prm ? 1 : k);
      for (const t of [0.2,0.5,0.8]) {
        const key = t.toFixed(1);
        const hit = ch.p >= t && !ch.way[key];
        if (hit) ch.way[key] = true, window.dispatchEvent(new CustomEvent('scene:waypoint', { detail:{ idx: ch.idx, t } }));
        if (ch.p < t) ch.way[key] = false;
      }
    }

    const idx = currentChapterIndex(scrollY);
    if (idx !== state.currentIdx) {
      state.currentIdx = idx;
      state.enteredAt = now;
      window.dispatchEvent(new CustomEvent('scene:enter', { detail:{ idx } }));
    }

    state.lastY = scrollY; state.lastT = now;
    window.requestAnimationFrame(step);
  }

  function init() {
    measure();
    addEventListener('resize', measure, { passive: true });
    addEventListener('load', measure);
    requestAnimationFrame(step);
  }

  function getState(){ return state; }

  return { init, getState };
})();

Driver.init();
