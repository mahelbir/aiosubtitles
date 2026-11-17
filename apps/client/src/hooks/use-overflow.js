'use client';

import {useRef, useState} from 'react';
import {useResizeObserver} from '@reactuses/core';

export function useOverflow() {
  const boxRef = useRef(null);
  const contentRef = useRef(null);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const isOverflowingRef = useRef(false);
  const collapseWidthRef = useRef(0);

  const measure = () => {
    const scroller = contentRef.current?.parentElement;
    if (!scroller) {
      return;
    }
    if (isOverflowingRef.current) {
      if (scroller.clientWidth > collapseWidthRef.current) {
        isOverflowingRef.current = false;
        setIsOverflowing(false);
      }
      return;
    }
    if (scroller.scrollWidth > scroller.clientWidth) {
      collapseWidthRef.current = scroller.clientWidth;
      isOverflowingRef.current = true;
      setIsOverflowing(true);
    }
  };

  useResizeObserver(boxRef, measure);
  useResizeObserver(contentRef, measure);

  return {boxRef, contentRef, isOverflowing};
}
