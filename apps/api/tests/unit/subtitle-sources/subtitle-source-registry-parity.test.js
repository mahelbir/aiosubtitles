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

  it('reserves server-path download calls only for the sources whose shared keys download', () => {
    expect(
      registeredClients
        .filter(([, client]) => client.canDownloadWithSharedCredential)
        .map(([subtitleSource]) => subtitleSource)
        .toSorted(),
    ).toEqual([SubtitleSource.ANISUB, SubtitleSource.THESUBTITLEDB].toSorted());
  });

  it.each(
    registeredClients.filter(([, client]) => client.isKeylessLimitSeparate),
  )(
    '%s, whose key leaves the keyless limit, reserves its server-path download calls',
    (subtitleSource, client) => {
      expect(client.canDownloadWithSharedCredential).toBe(true);
    },
  );

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
    async (subtitleSource, client) => {
      const {credentialRequirement} = SubtitleSource.raw(subtitleSource);
      const keylessCalls = await Promise.all([
        client.canSearchWithoutCredential(),
        client.canDownloadWithoutCredential(),
      ]);
      for (const keylessCall of keylessCalls) {
        expect(keylessCall).toBeTypeOf('boolean');
      }
      if (credentialRequirement === CredentialRequirement.REQUIRED) {
        expect(keylessCalls).toEqual([false, false]);
        expect(client.canUseSharedCredential).not.toBe(true);
      }
      if (credentialRequirement === CredentialRequirement.NONE) {
        expect(keylessCalls).toEqual([true, true]);
        expect(client.credentialKinds).toEqual([]);
      }
      if (credentialRequirement === CredentialRequirement.OPTIONAL) {
        expect(client.credentialKinds.length).toBeGreaterThan(0);
      }
    },
  );

  it.each(
    registeredClients.filter(
      ([subtitleSource]) => subtitleSource !== SubtitleSource.OPENSUBTITLES,
    ),
  )('%s is always available', async (subtitleSource, client) => {
    await expect(Promise.resolve(client.isAvailable())).resolves.toBe(true);
  });

  it('lets exactly Jimaku, BetaSeries and AniSub draw on shared server credentials', () => {
    expect(
      registeredClients
        .filter(([, client]) => client.canUseSharedCredential === true)
        .map(([subtitleSource]) => subtitleSource)
        .toSorted(),
    ).toEqual(
      [
        SubtitleSource.ANISUB,
        SubtitleSource.BETASERIES,
        SubtitleSource.JIMAKU,
      ].toSorted(),
    );
    for (const [subtitleSource, client] of registeredClients) {
      if (client.canUseSharedCredential) {
        expect(SubtitleSource.raw(subtitleSource).credentialRequirement).toBe(
          CredentialRequirement.OPTIONAL,
        );
      }
    }
  });
});
