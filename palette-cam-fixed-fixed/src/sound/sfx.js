const MAP = {
  click:   'assets/sfx/click.mp3',
  open:    'assets/sfx/open.mp3',
  close:   'assets/sfx/close.mp3',
  freeze:  'assets/sfx/freeze.mp3',
  unfreeze:'assets/sfx/unfreeze.mp3',
  tick:    'assets/sfx/tick.mp3',
};

const cache = new Map();
let primed = false;

export function primeOnce() {
  if (primed) return;
  primed = true;
  // Preload silently after first user gesture (iOS policy)
  for (const [name, url] of Object.entries(MAP)) {
    const a = new Audio(url);
    a.preload = 'auto';
    cache.set(name, a);
  }
}

export function play(name, { volume = 0.8 } = {}) {
  const a = cache.get(name);
  if (!a) return;
  try {
    a.currentTime = 0;
    a.volume = volume;
    a.play();
  } catch {}
}
