import {describe, expect, it} from 'vitest';
import {CredentialKind} from '@repo/shared/constants/credential.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {altyazidbClient} from '../../../src/lib/subtitle-sources/altyazidb/altyazidb-client.js';
import {listSubtitleSourceClients} from '../../../src/lib/subtitle-sources/subtitle-source-clients.js';
import {SubtitleSourceBudgetScope} from '../../../src/lib/subtitle-sources/subtitle-source-contract.js';

describe('altyazidbClient', () => {
  it('names its subtitle source and needs an api key', () => {
    expect(altyazidbClient.subtitleSource).toBe(SubtitleSource.ALTYAZIDB);
    expect(altyazidbClient.credentialKinds).toEqual([CredentialKind.API_KEY]);
    expect(altyazidbClient.canSearchWithoutCredential()).toBe(false);
    expect(altyazidbClient.canDownloadWithoutCredential()).toBe(false);
  });

  it('searches by id, not by video hash', () => {
    expect(altyazidbClient.isSearchHashSensitive).toBe(false);
  });

  it('declares the default budget for an unknown limit', () => {
    expect(altyazidbClient.downloadBudgets).toEqual([
      {
        budgetScope: SubtitleSourceBudgetScope.SUBTITLE_SOURCE,
        windowMs: 60000,
        requestMax: 10,
      },
      {
        budgetScope: SubtitleSourceBudgetScope.CREDENTIAL,
        windowMs: 60000,
        requestMax: 10,
      },
    ]);
  });

  it('implements the search, download and credential check calls', () => {
    expect(altyazidbClient.searchSubtitles).toBeTypeOf('function');
    expect(altyazidbClient.downloadSubtitle).toBeTypeOf('function');
    expect(altyazidbClient.checkCredential).toBeTypeOf('function');
  });

  it('is registered with the subtitle source clients', () => {
    expect(listSubtitleSourceClients()).toContain(altyazidbClient);
  });
});
