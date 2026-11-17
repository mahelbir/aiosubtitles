'use client';

import {useFixtureRecord} from '../api';
import {FixtureState} from './fixture-state';

export function AppErrorFixture() {
  const {data} = useFixtureRecord();
  if (data === null) {
    throw new Error('Kayıt okunamadı.');
  }
  return <FixtureState value={{name: data?.name ?? null}} />;
}
