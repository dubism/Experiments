import { Driver } from './scrollDriver.js';

export const Scenes = (() => {
  const lerp = (a,b,t) => a + (b-a)*t;

  function spring01(t, w=16, z=0.85) {
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

    const y = (1 - ch.p) * 18;
    title.style.transform = `translate3d(0, ${y}vh, 0)`;
    title.style.opacity = String(0.5 + 0.5*(1 - ch.p));

    const lag = ch.pLag;
    const haloY = (1 - lag) * 40 - 20;
    halo.style.transform = `translate3d(0, ${haloY}vh, 0) scale(${(0.9 + 0.3*lag).toFixed(3)})`;
    halo.style.opacity = String(0.15 + 0.35*lag);

    const enteredS = (now - Driver.getState().enteredAt) / 1000;
    const s = spring01(Math.max(0, enteredS), 16, 0.85);
    title.style.letterSpacing = `${(-0.05 + 0.03*s).toFixed(3)}em`;
  }

  function applyProject(ch) {
    const scene = ch.el.querySelector('.scene');
    if (!scene) return;
    const hero = scene.querySelector('.hero img');
    const cap = scene.querySelector('figcaption');
    const motif = scene.querySelector('.motif');

    const sceneY = (1 - ch.p) * 8 - 4;
    scene.style.transform = `translate3d(0, ${sceneY}vh, 0)`;

    const heroY = (1 - ch.pLag) * 60 - 30;
    const heroScale = 0.92 + 0.18*ch.pLag;
    hero.style.transform = `translate3d(0, ${heroY}vh, 0) scale(${heroScale.toFixed(3)})`;

    const capY = (1 - ch.p) * 24 - 12;
    cap.style.transform = `translate3d(0, ${capY}vh, 0)`;

    const motifY = (1 - ch.pLag) * 120 - 60;
    const motifRot = -12 + 24*ch.pLag;
    const sway = Math.sin(ch.pLag * Math.PI * 2) * 6;
    const motifScale = 0.85 + 0.35*ch.pLag;
    motif.style.transform = `translate3d(${sway}vw, ${motifY}vh, 0) rotate(${motifRot.toFixed(2)}deg) scale(${motifScale.toFixed(3)})`;

    const fadeIn = Math.min(1, Math.max(0, (ch.p - 0.05) / 0.25));
    const fadeOut = Math.min(1, Math.max(0, (ch.p - 0.70) / 0.25));
    const vis = Math.max(0, 1 - fadeOut) * fadeIn;
    hero.style.opacity = String(vis);
    cap.style.opacity  = String(vis);

    const v = Math.min(16, Math.abs(Driver.getState().velocity) * 0.06);
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
      el.style.inset = '0';
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
          const y = (1 - ch.pLag) * 16 - 8 + Math.sin((ch.pLag + phase) * Math.PI*2)*2;
          li.style.transform = `translate3d(0, ${y}vh, 0)`;
        });
      }
    }
    requestAnimationFrame(render);
  }

  function init() {
    injectMotifs();
    window.addEventListener('scene:enter', (e) => {});
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
