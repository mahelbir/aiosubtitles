function scoreHref(href, segments, current) {
  if (!href || href[0] !== '/') {
    return -1;
  }
  const queryIndex = href.indexOf('?');
  const path = queryIndex === -1 ? href : href.slice(0, queryIndex);
  const linkSegments = path.split('/').filter(Boolean);
  const {length} = linkSegments;
  if (!length || length > segments.length) {
    return -1;
  }
  for (let i = 0; i < length; i++) {
    if (linkSegments[i] !== segments[i]) {
      return -1;
    }
  }
  if (queryIndex === -1) {
    return length;
  }
  const linkParams = [...new URLSearchParams(href.slice(queryIndex + 1))];
  const isMatch = linkParams.every(([key, value]) =>
    current.getAll(key).includes(value),
  );
  return isMatch ? length + linkParams.length * 0.1 : -1;
}

export function resolveActiveHref(items, pathname, search = '') {
  const segments = pathname.split('/').filter(Boolean);
  const current = new URLSearchParams(search);
  let activeHref = null;
  let bestScore = -1;

  const walk = nodes => {
    for (const node of nodes ?? []) {
      const score = scoreHref(node.href, segments, current);
      if (score > bestScore) {
        bestScore = score;
        activeHref = node.href;
      }
      walk(node.items);
    }
  };

  walk(items);
  return activeHref;
}

export function containsHref(items, href) {
  return (items ?? []).some(
    item => item.href === href || containsHref(item.items, href),
  );
}
