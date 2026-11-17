'use client';

import {useEffect} from 'react';
import {fixtureToolkit} from '../lib/fixture-toolkit';

export function FixtureToolkit() {
  useEffect(() => {
    window.__fixture = fixtureToolkit;
    return () => {
      delete window.__fixture;
    };
  }, []);

  return null;
}
