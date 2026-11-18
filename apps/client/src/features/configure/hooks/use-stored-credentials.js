'use client';

import {createContext, use} from 'react';

const NO_STORED_CREDENTIALS = [];

export const StoredCredentialsContext = createContext(NO_STORED_CREDENTIALS);

export function useStoredCredentials() {
  return use(StoredCredentialsContext);
}

export function useStoredCredential(credentialId) {
  const storedCredentials = useStoredCredentials();
  return credentialId === undefined
    ? null
    : (storedCredentials.find(
        storedCredential => storedCredential.credentialId === credentialId,
      ) ?? null);
}
