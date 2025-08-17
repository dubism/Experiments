import { Driver } from './scrollDriver.js';

export const Scenes = (() => {
  // helpers
  const lerp = (a,b,t) => a + (b-a)*t;

  // Spring: 0->1 with overshoot (critically damped-ish)
  function spring01(t, w=14, z=0.88) {
    if (t <= 0) return 0;
    const zz = Math.min(0.999, Math.max(0.01, z));
    const wd = w*Math.sqrt(1 - zz*zz);
    const e = Math.exp(-zz*w*t);
    const s = 1 - e*(Math.cos(wd*t) + (zz/Math.sqrt(1 - zz*zz))*Math.sin(wd*t));
    return Math.min(1, s);
  }

  function applyIntro(ch, now) {
    const root = ch.el.querySelector('.intro');
    if (!root) return;
    const title = root.querySelector('.title');
    const halo = root.querySelector('.halo');
    const y = (1 - ch.p) * 8;
    title.style.transform = `translate3d(0, ${y}vh, 0)`;
    title.style.opacity = String(0.6 + 0.4*(1 - ch.p));

    const lag = ch.pLag;
    halo.style.transform = `translate3d(0, ${lerp(10, -15, lag)}vh, 0) scale(${lerp(0.92, 1.12, lag)})`;
    halo.style.opacity = String(lerp(0.2, 0.45, lag));

    const enteredS = (now - Driver.getState().enteredAt) / 1000;
    const s = spring01(Math.max(0, enteredS));
    title.style.letterSpacing = `${lerp(-0.04, -0.02, s)}em`;
  }

  function applyProject(ch) {
    const scene = ch.el.querySelector('.scene');
    if (!scene) return;
    const hero = scene.querySelector('.hero img');
    const cap = scene.querySelector('figcaption');
    const motif = scene.querySelector('.motif');
    const fgY = lerp(10, -10, ch.p);
    const bgY = lerp(18, -18, ch.pLag);
    scene.style.transform = `translate3d(0, ${fgY}vh, 0)`;
    motif.style.transform = `translate3d(0, ${bgY}vh, 0) scale(${lerp(0.9, 1.1, ch.pLag)})`;

    const visible = ch.p < 0.85 ? 1 : lerp(1, 0, (ch.p - 0.85)/0.15);
    hero.style.opacity = String(visible);
    cap.style.opacity  = String(visible);

    const v = Math.min(8, Math.abs(Driver.getState().velocity) * 0.02);
    hero.style.filter = `blur(${v.toFixed(2)}px)`;
  }

  function ringsSVG(rings=7){
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS,'svg');
    svg.setAttribute('viewBox','-100 -100 200 200');
    svg.setAttribute('width','100%'); svg.setAttribute('height','100%');
    for(let i=0;i<rings;i++){
      const c = document.createElementNS(NS,'circle');
      c.setAttribute('cx','0'); c.setAttribute('cy','0');
      c.setAttribute('r', String(20 + i*18));
      c.setAttribute('fill','none');
      c.setAttribute('stroke','currentColor');
      c.setAttribute('opacity', String(0.35 - i*0.03));
      c.setAttribute('stroke-width', '1.5');
      svg.appendChild(c);
    }
    svg.style.color = 'color-mix(in oklab, var(--acc) 60%, transparent)';
    return svg;
  }

  function injectMotifs(){
    document.querySelectorAll('.scene .motif').forEach((el) => {
      el.innerHTML = '';
      el.appendChild(ringsSVG(7));
      el.style.position = 'absolute';
      el.style.inset = 'auto 0 0 0';
      el.style.zIndex = '-1';
      el.style.pointerEvents = 'none';
    });
  }

  function render(now) {
    const { chapters } = Driver.getState();
    for (const ch of chapters) {
      const idx = ch.idx;
      if (idx === 0) applyIntro(ch, now);
      else if (idx >= 1 && idx <= 5) applyProject(ch);
      else if (idx === 7) {
        const logos = ch.el.querySelectorAll('.logos li');
        logos.forEach((li, i) => {
          const phase = i / Math.max(1, logos.length-1);
          const y = lerp(8, -8, ch.pLag) + Math.sin((ch.pLag + phase) * Math.PI*2)*2;
          li.style.transform = `translate3d(0, ${y}vh, 0)`;
        });
      }
    }
    requestAnimationFrame(render);
  }

  function init() {
    injectMotifs();
    window.addEventListener('scene:enter', (e) => {
      // Chapter entry hook available
    });
    window.addEventListener('scene:waypoint', (e) => {
      const { idx, t } = e.detail;
      if (Math.abs(t - 0.5) < 0.001) {
        const chapter = document.querySelector(`.chapter[data-ch="${idx}"]`);
        chapter?.querySelector('.proj-sub')?.classList.toggle('alt');
      }
    });
    requestAnimationFrame(render);
  }

  return { init };
})();

Scenes.init();
