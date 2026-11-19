import {describe, expect, it} from 'vitest';
import {
  CredentialRequirement,
  SubtitleSource,
} from '@repo/shared/constants/subtitle-source.js';
import {listSubtitleSourceClients} from '../../../src/lib/subtitle-sources/subtitle-source-clients.js';

const registeredClients = listSubtitleSourceClients().map(client => [
  client.subtitleSource,
  client,
]);

describe('the subtitle source registry', () => {
  it('registers one client for every subtitle source', () => {
    expect(
      registeredClients.map(([subtitleSource]) => subtitleSource).toSorted(),
    ).toEqual([...SubtitleSource.values].toSorted());
  });

  it.each(registeredClients)(
    '%s takes the credential kinds its source declares',
    (subtitleSource, client) => {
      expect(client.credentialKinds).toEqual(
        SubtitleSource.raw(subtitleSource).credentialKinds,
      );
    },
  );

  it.each(registeredClients)(
    '%s searches and downloads without a key exactly as its requirement allows',
    (subtitleSource, client) => {
      const {credentialRequirement} = SubtitleSource.raw(subtitleSource);
      const keylessCalls = [
        client.canSearchWithoutCredential(),
        client.canDownloadWithoutCredential(),
      ];
      if (credentialRequirement === CredentialRequirement.REQUIRED) {
        expect(keylessCalls).toEqual([false, false]);
      }
      if (credentialRequirement === CredentialRequirement.NONE) {
        expect(keylessCalls).toEqual([true, true]);
        expect(client.credentialKinds).toEqual([]);
      }
      if (credentialRequirement === CredentialRequirement.OPTIONAL) {
        expect(client.credentialKinds.length).toBeGreaterThan(0);
        expect(keylessCalls).toContain(true);
      }
    },
  );
});
