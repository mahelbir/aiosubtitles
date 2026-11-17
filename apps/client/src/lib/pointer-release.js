let isPointerDown = false;
let pending = [];

function release() {
  isPointerDown = false;
  const callbacks = pending;
  pending = [];
  setTimeout(() => callbacks.forEach(callback => callback()));
}

if (typeof window !== 'undefined') {
  const options = {capture: true, passive: true};
  window.addEventListener(
    'pointerdown',
    event => {
      if (event.button === 0) {
        isPointerDown = true;
      }
    },
    options,
  );
  window.addEventListener('pointerup', release, options);
  window.addEventListener('pointercancel', release, options);
  window.addEventListener('contextmenu', release, options);
  window.addEventListener('blur', release, {passive: true});
}

export function afterPointerRelease(callback) {
  if (isPointerDown) {
    pending.push(callback);
    return;
  }
  callback();
}
