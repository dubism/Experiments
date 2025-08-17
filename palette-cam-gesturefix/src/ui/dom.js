export const $ = sel => document.querySelector(sel);
export const $$ = sel => Array.from(document.querySelectorAll(sel));
export const on = (el, ev, fn, opts) => el.addEventListener(ev, fn, opts);
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
