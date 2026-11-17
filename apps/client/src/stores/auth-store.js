import {pick} from 'es-toolkit';
import {create} from 'zustand';
import {persist} from 'zustand/middleware';

const SIGNED_OUT = Object.freeze({
  accessToken: null,
  refreshToken: null,
  expiresAt: null,
  principal: null,
});

const SESSION_KEYS = Object.keys(SIGNED_OUT);

function toExpiresAt(expiresIn) {
  return Date.now() + expiresIn * 1000;
}

export const useAuthStore = create(
  persist(
    (set, get, store) => {
      const isCurrentSession = refreshToken => {
        store.persist.rehydrate();
        return get().refreshToken === refreshToken;
      };
      const patchSession = (refreshToken, patch) => {
        if (isCurrentSession(refreshToken)) {
          set(patch);
        }
      };
      return {
        ...SIGNED_OUT,
        sessionExpired: false,
        _hasHydrated: false,
        isCurrentSession,
        setSession: ({accessToken, refreshToken, expiresIn}) =>
          set({
            accessToken,
            refreshToken,
            expiresAt: toExpiresAt(expiresIn),
            sessionExpired: false,
          }),
        applyRefresh: (sessionToken, {accessToken, refreshToken, expiresIn}) =>
          patchSession(sessionToken, {
            accessToken,
            refreshToken: refreshToken || sessionToken,
            expiresAt: toExpiresAt(expiresIn),
          }),
        setPrincipal: (refreshToken, principal) =>
          patchSession(refreshToken, {principal}),
        expireSession: refreshToken =>
          patchSession(refreshToken, {...SIGNED_OUT, sessionExpired: true}),
        clearSession: () => set({...SIGNED_OUT, sessionExpired: false}),
        ackSessionExpired: () => set({sessionExpired: false}),
        setHasHydrated: value => set({_hasHydrated: value}),
      };
    },
    {
      name: 'auth',
      version: 1,
      migrate: () => undefined,
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...SIGNED_OUT,
        ...persistedState,
      }),
      partialize: state => pick(state, SESSION_KEYS),
      onRehydrateStorage: state => () => {
        if (!state._hasHydrated) {
          state.setHasHydrated(true);
        }
      },
      skipHydration: true,
    },
  ),
);

export function syncAuthStorage({key}) {
  if (key === null || key === useAuthStore.persist.getOptions().name) {
    useAuthStore.persist.rehydrate();
  }
}
