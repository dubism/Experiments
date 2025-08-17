import { $, on } from '../ui/dom.js';
import { play } from '../sound/sfx.js';

// --- Module State ---
let source = 'camera';
let photoBitmap = null;
let photoZ = 1, photoCX = 0, photoCY = 0;
let uiZoom = 1;
let _stream = null;
let videoEl = null;

// --- Private Helpers ---
function boundPhotoCenter() {
  if (!photoBitmap) return;
  const iw = photoBitmap.width, ih = photoBitmap.height;
  const baseCrop = Math.min(iw, ih), crop = baseCrop / Math.max(1, photoZ);
  const half = crop / 2;
  photoCX = Math.max(half, Math.min(iw - half, photoCX));
  photoCY = Math.max(half, Math.min(ih - half, photoCY));
}

// --- Public (Exported) Functions ---
export function getSource() { return source; }
export function getPhotoBitmap() { return photoBitmap; }
export function getVideoElement() { return videoEl; }

export function setUiZoom(v) {
  uiZoom = v;
  document.documentElement.style.setProperty('--zoom', uiZoom);
}

export function setPhotoZoom(v) {
  photoZ = v;
  boundPhotoCenter();
  drawPhotoPreview();
}

export function drawPhotoPreview() {
  if (source !== 'photo' || !photoBitmap) return;
  const photoPreview = $('#photoPreview');
  const wrap = $('#videoPane');
  const w = photoPreview.width  = wrap.clientWidth;
  const h = photoPreview.height = wrap.clientHeight;
  const g = photoPreview.getContext('2d');
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.clearRect(0, 0, w, h);
  const { sx, sy, sw, sh } = currentPhotoSrcRect();
  g.drawImage(photoBitmap, sx, sy, sw, sh, 0, 0, w, h);
  photoPreview.style.display = 'block';
}

export function computeSquareCrop() {
  const vw = videoEl.videoWidth || 0, vh = videoEl.videoHeight || 0;
  if (!vw || !vh) return { sx: 0, sy: 0, sw: 0, sh: 0 };
  const z = Math.max(1, uiZoom);
  const base = Math.min(vw, vh);
  const sw = Math.round(base / z);
  const sh = sw;
  const sx = Math.floor((vw - sw) / 2);
  const sy = Math.floor((vh - sh) / 2);
  return { sx, sy, sw, sh };
}

export function currentPhotoSrcRect() {
  if (!photoBitmap) return { sx: 0, sy: 0, sw: 0, sh: 0 };
  const iw = photoBitmap.width, ih = photoBitmap.height;
  const baseCrop = Math.min(iw, ih), crop = baseCrop / Math.max(1, photoZ);
  const sx = Math.max(0, Math.min(iw - crop, photoCX - crop / 2));
  const sy = Math.max(0, Math.min(ih - crop, photoCY - crop / 2));
  return { sx, sy, sw: crop, sh: crop };
}

export async function startCamera(statusUpdater) {
  try {
    statusUpdater('Requesting camera…');
    const cstr = {
      audio: false,
      video: {
        facingMode: { ideal: 'environment' },
        width: { min: 320, ideal: 1280, max: 1920 },
        height: { min: 320, ideal: 1280, max: 1920 },
        frameRate: { ideal: 30, max: 60 }
      }
    };

    _stream?.getTracks?.().forEach(t => t.stop());
    _stream = await navigator.mediaDevices.getUserMedia(cstr);

    videoEl.setAttribute('playsinline', '');
    videoEl.setAttribute('muted', '');
    videoEl.muted = true;
    videoEl.srcObject = _stream;

    await new Promise((res) => videoEl.addEventListener('loadedmetadata', res, { once: true }));
    await videoEl.play().catch(() => {
      statusUpdater('Tap to start camera');
      const resume = () => {
        videoEl.play().finally(() => {
          statusUpdater('Live');
          document.removeEventListener('click', resume, true);
          document.removeEventListener('touchend', resume, true);
        });
      };
      document.addEventListener('click', resume, true);
      document.addEventListener('touchend', resume, true);
    });

    if (statusUpdater) statusUpdater('Live');
  } catch (err) {
    console.error(err);
    const message = err?.name === 'NotAllowedError' ? 'Camera permission denied'
                  : err?.name === 'OverconstrainedError' ? 'Camera constraints failed'
                  : 'Camera error';
    if (statusUpdater) statusUpdater(message);
    throw err;
  }
}

export function initCamera(elements, statusUpdater, toast) {
  videoEl = elements.video;
  const { srcCamera, srcPhoto, pick, photoPreview } = elements;

  function updateSourceChip() {
    srcCamera?.setAttribute('aria-pressed', String(source === 'camera'));
    srcPhoto?.setAttribute('aria-pressed', String(source === 'photo'));
  }

  on(srcCamera, 'click', () => {
    if (source === 'camera') return;
    play('click');
    source = 'camera';
    updateSourceChip();
    statusUpdater('Live');
    photoBitmap = null;
    photoPreview.style.display = 'none';
  });

  on(srcPhoto, 'click', () => { play('click'); pick?.click(); });
  on(pick, 'change', async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      statusUpdater('Loading photo…');
      const bmp = await createImageBitmap(f, { imageOrientation: 'from-image' });
      photoBitmap = bmp;
      photoZ = 1; photoCX = bmp.width / 2; photoCY = bmp.height / 2;
      elements.zoomSlider.value = '1';
      source = 'photo';
      updateSourceChip();
      drawPhotoPreview();
      statusUpdater('Photo');
    } catch (_) {
      statusUpdater('Photo load failed');
      toast('Could not load the selected photo.');
    } finally {
      e.target.value = '';
    }
  });

  on(document, 'visibilitychange', () => {
    if (document.visibilityState === 'visible' && source === 'camera') {
      videoEl.play().catch(() => {});
    }
  });
  updateSourceChip();
}
