const GLIDE = {duration: 250, easing: 'ease-out'};

function glideRowGap(element, action) {
  const previous = element.previousElementSibling;
  const neighbor = previous ?? element.nextElementSibling;
  if (!neighbor || neighbor.offsetTop === element.offsetTop) {
    return;
  }
  const closedGap = `-${getComputedStyle(element.parentElement).rowGap}`;
  neighbor.animate(
    {
      [previous ? 'marginBottom' : 'marginTop']:
        action === 'add' ? [closedGap, '0px'] : ['0px', closedGap],
    },
    GLIDE,
  );
}

export function rowMotion(element, action) {
  if (action === 'remain') {
    return new KeyframeEffect(element, [], GLIDE);
  }
  glideRowGap(element, action);
  const closed = {height: '0px', opacity: 0, overflow: 'hidden'};
  const opened = {
    height: `${element.offsetHeight}px`,
    opacity: 1,
    overflow: 'hidden',
  };
  return [
    new KeyframeEffect(
      element,
      action === 'add' ? [closed, opened] : [opened, closed],
      GLIDE,
    ),
    {styleReset: false},
  ];
}

export function glideHeightOnSwap(node) {
  let height = node.offsetHeight;
  let animation = null;
  const isGliding = () => animation?.playState === 'running';

  const resizeObserver = new ResizeObserver(() => {
    if (!isGliding()) {
      height = node.offsetHeight;
    }
  });
  const mutationObserver = new MutationObserver(() => {
    const from = isGliding() ? node.getBoundingClientRect().height : height;
    animation?.cancel();
    height = node.offsetHeight;
    const isReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    if (Math.round(from) !== height && !isReducedMotion) {
      animation = node.animate({height: [`${from}px`, `${height}px`]}, GLIDE);
    }
  });

  resizeObserver.observe(node);
  mutationObserver.observe(node, {childList: true});
  return () => {
    resizeObserver.disconnect();
    mutationObserver.disconnect();
    animation?.cancel();
  };
}
