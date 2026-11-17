'use client';

import {useEffect} from 'react';
import {useTheme} from 'next-themes';

const THEME_COLOR_SELECTOR = 'meta[name="theme-color"]';

export function ThemeColorMeta() {
  const {resolvedTheme} = useTheme();

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const color = getComputedStyle(document.body).backgroundColor;
      if (!color) {
        return;
      }
      const metas = document.head.querySelectorAll(THEME_COLOR_SELECTOR);
      if (metas.length === 0) {
        const meta = document.createElement('meta');
        meta.name = 'theme-color';
        meta.content = color;
        document.head.append(meta);
        return;
      }
      for (const meta of metas) {
        meta.content = color;
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [resolvedTheme]);

  return null;
}
