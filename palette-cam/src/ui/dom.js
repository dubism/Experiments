export const $ = (sel, el = document) => el.querySelector(sel);
export const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));

export function on(el, type, fn, opts) {
  // Default to {passive:false} so preventDefault() works for pointer/touch/wheel
  const options = (opts === undefined) ? { passive: false } : opts;
  el.addEventListener(type, fn, options);
  return () => el.removeEventListener(type, fn, options);
}

export function clamp(v, min, max){ return v<min?min:(v>max?max:v); }
