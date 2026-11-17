'use client';

import {useCallback, useState} from 'react';
import autoAnimate from '@formkit/auto-animate';
import {useReducedMotion} from '@reactuses/core';
import {noop} from 'es-toolkit';

/**
 * @param {Partial<import('@formkit/auto-animate').AutoAnimateOptions>|import('@formkit/auto-animate').AutoAnimationPlugin} [options]
 * @returns {(node: HTMLElement) => () => void}
 */
export function useAutoAnimate(options) {
  const [initialOptions] = useState(() => options);
  const isStill =
    useReducedMotion(false) && typeof initialOptions === 'function';

  return useCallback(
    node => (isStill ? noop : autoAnimate(node, initialOptions).destroy),
    [initialOptions, isStill],
  );
}
