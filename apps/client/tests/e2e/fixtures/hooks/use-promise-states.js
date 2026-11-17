'use client';

import {useState} from 'react';

export function usePromiseStates() {
  const [states, setStates] = useState({});

  const settle = (name, state) =>
    setStates(current => ({...current, [name]: state}));

  const track = async (name, promise) => {
    settle(name, {status: 'pending'});
    try {
      settle(name, {status: 'fulfilled', value: await promise});
    } catch (error) {
      settle(name, {
        status: 'rejected',
        error: {message: error.message, status: error.status},
      });
    }
  };

  return [states, track];
}
