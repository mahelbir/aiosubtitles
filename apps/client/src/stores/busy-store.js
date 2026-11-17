import {create} from 'zustand';

export const useBusyStore = create(set => ({
  count: 0,
  begin: () => set(state => ({count: state.count + 1})),
  end: () => set(state => ({count: Math.max(0, state.count - 1)})),
}));
