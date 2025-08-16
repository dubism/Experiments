// src/features/manualPicker.js

export function initManualPicker(elements, state, offCtx) {
  // Extend state (idempotent)
  Object.assign(state, {
    mode: state.mode || 'DEFAULT',
    mpmActiveIndex: 0,
    mpm: Object.assign({ longPressMs: 500, moveTolPx: 12, sampleRadiusPx: 8, autoAdvance: false }, state.mpm || {})
  });

  // Create Done button (once)
  if (!elements.mpmDone) {
    const doneBtn = document.createElement('button');
    doneBtn.id = 'mpmDone';
    doneBtn.textContent = 'Done';
    elements.cc.appendChild(doneBtn);
    elements.mpmDone = doneBtn;
  }

  // Create picker puck (once)
  let picker = elements.pickerPuck;
  if (!picker) {
    picker = document.createElement('div');
    picker.id = 'pickerPuck';
    elements.cc.appendChild(picker);
    elements.pickerPuck = picker;
  }

  // Palette helpers
  function setActiveSlot(idx) {
    state.mpmActiveIndex = Math.max(0, Math.min(state.K - 1, idx));
    [...elements.swatches.children].forEach((el, i) =>
      el.classList.toggle('active', i === state.mpmActiveIndex)
    );
  }

  function writeSlot(idx, rgb) {
    if (!elements.swatches.children[idx]) return;
    elements.swatches.children[idx].style.background = `rgb(${rgb.join(',')})`;
  }

  // Swatch click → change active slot
  elements.swatches.addEventListener('click', (e) => {
    const sw = e.target.closest('.swatch');
    if (!sw) return;
    const idx = [...elements.swatches.children].indexOf(sw);
    if (idx >= 0) setActiveSlot(idx);
  });

  // Color space utils
  function srgbToLin(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function linToSrgb(c) { c = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; return Math.max(0, Math.min(255, Math.round(c * 255))); }

  // Averaging
  function sampleAverageAt(ctx, ox, oy, radiusPx) {
    const r = Math.max(1, Math.round(radiusPx));
    const x0 = Math.max(0, ox - r), y0 = Math.max(0, oy - r);
    const x1 = Math.min(state.procWidth - 1, ox + r), y1 = Math.min(state.procWidth - 1, oy + r);
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    const { data } = ctx.getImageData(x0, y0, w, h);

    const r2 = r * r;
    let sumR = 0, sumG = 0, sumB = 0, count = 0;
    for (let yy = 0; yy < h; yy++) {
      for (let xx = 0; xx < w; xx++) {
        const dx = (x0 + xx) - ox, dy = (y0 + yy) - oy;
        if (dx * dx + dy * dy > r2) continue;
        const i = 4 * (yy * w + xx);
        if (data[i + 3] < 200) continue;
        sumR += srgbToLin(data[i]);
        sumG += srgbToLin(data[i + 1]);
        sumB += srgbToLin(data[i + 2]);
        count++;
      }
    }
    if (!count) return [0, 0, 0];
    return [linToSrgb(sumR / count), linToSrgb(sumG / count), linToSrgb(sumB / count)];
  }

  // Coord mapping
  function getSquareRect() { return elements.cc.getBoundingClientRect(); }
  function clientToOff(xClient, yClient) {
    const r = getSquareRect();
    const x = (xClient - r.left) / r.width;
    const y = (yClient - r.top) / r.height;
    const u = Math.max(0, Math.min(1, x));
    const v = Math.max(0, Math.min(1, y));
    const ox = Math.round(u * (state.procWidth - 1));
    const oy = Math.round(v * (state.procWidth - 1));
    return { ox, oy, u, v };
  }

  // Picker visuals
  function movePicker(clientX, clientY) {
    picker.style.left = clientX + 'px';
    picker.style.top  = clientY + 'px';
  }
  function showPickerAt(clientX, clientY) {
    movePicker(clientX, clientY);
    picker.style.transition = 'transform .5s ease';
    picker.style.transform  = 'scale(1)';
  }
  function hidePicker() {
    picker.style.transition = 'transform .18s ease';
    picker.style.transform  = 'scale(0)';
  }
  function snapPicker() {
    picker.style.transition = 'transform .12s ease';
    picker.style.transform  = 'scale(1.08)';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => { picker.style.transform = 'scale(1)'; });
    });
  }

  // Mode control
  function enterMPM(x, y) {
    state.mode = 'MPM';
    elements.mpmDone.style.display = 'inline-block';
    setActiveSlot(0);
    const { ox, oy } = clientToOff(x, y);
    const rgb = sampleAverageAt(offCtx, ox, oy, state.mpm.sampleRadiusPx);
    picker.style.background = `rgb(${rgb.join(',')})`;
    writeSlot(0, rgb);
  }
  function exitMPM() {
    state.mode = 'DEFAULT';
    elements.mpmDone.style.display = 'none';
    hidePicker();
    [...elements.swatches.children].forEach(el => el.classList.remove('active'));
  }
  elements.mpmDone.addEventListener('click', exitMPM);

  // Gesture logic
  let pressTimer = 0, pressStartX = 0, pressStartY = 0, pressing = false, dragging = false;
  let rafId = 0;

  function clearPress() {
    pressing = false; dragging = false;
    clearTimeout(pressTimer); pressTimer = 0;
  }

  function onPointerDown(e) {
    e.preventDefault();
    const touch = e.touches ? e.touches[0] : e;
    pressStartX = touch.clientX; pressStartY = touch.clientY;
    pressing = true;

    movePicker(pressStartX, pressStartY);
    picker.style.transform = 'scale(0)';
    showPickerAt(pressStartX, pressStartY);

    pressTimer = setTimeout(() => {
      if (!pressing) return;
      snapPicker();
      enterMPM(pressStartX, pressStartY);
      dragging = true;
    }, state.mpm.longPressMs);
  }

  function onPointerMove(e) {
    if (!pressing && !dragging) return;
    const touch = e.touches ? e.touches[0] : e;
    const dx = touch.clientX - pressStartX, dy = touch.clientY - pressStartY;

    if (pressing && (dx * dx + dy * dy) > state.mpm.moveTolPx * state.mpm.moveTolPx) {
      clearPress();
      hidePicker();
      return;
    }

    if (dragging) {
      e.preventDefault();
      movePicker(touch.clientX, touch.clientY);
      if (!rafId) {
        rafId = requestAnimationFrame(() => {
          rafId = 0;
          const { ox, oy } = clientToOff(touch.clientX, touch.clientY);
          const rgb = sampleAverageAt(offCtx, ox, oy, state.mpm.sampleRadiusPx);
          picker.style.background = `rgb(${rgb.join(',')})`;
          writeSlot(state.mpmActiveIndex, rgb);
        });
      }
    }
  }

  function onPointerUp() {
    if (pressing && !dragging) hidePicker();
    clearPress();
  }

  // Bind
  elements.cc.style.touchAction = 'none';
  elements.cc.addEventListener('touchstart',  onPointerDown, { passive: false });
  elements.cc.addEventListener('touchmove',   onPointerMove, { passive: false });
  elements.cc.addEventListener('touchend',    onPointerUp,   { passive: false });
  elements.cc.addEventListener('touchcancel', onPointerUp,   { passive: false });

  // Optional mouse support
  elements.cc.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse') onPointerDown(e); }, { passive: false });
  elements.cc.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') onPointerMove(e); }, { passive: false });
  elements.cc.addEventListener('pointerup',   (e) => { if (e.pointerType === 'mouse') onPointerUp(e);   }, { passive: false });
}