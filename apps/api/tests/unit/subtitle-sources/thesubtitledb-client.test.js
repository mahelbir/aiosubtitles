import {describe, expect, it} from 'vitest';
import {CredentialKind} from '@repo/shared/constants/credential.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {listSubtitleSourceClients} from '../../../src/lib/subtitle-sources/subtitle-source-clients.js';
import {SubtitleSourceBudgetScope} from '../../../src/lib/subtitle-sources/subtitle-source-contract.js';
import {thesubtitledbClient} from '../../../src/lib/subtitle-sources/thesubtitledb/thesubtitledb-client.js';

describe('thesubtitledbClient', () => {
  it('names its subtitle source and takes an optional api key', () => {
    expect(thesubtitledbClient.subtitleSource).toBe(
      SubtitleSource.THESUBTITLEDB,
    );
    expect(thesubtitledbClient.credentialKinds).toEqual([
      CredentialKind.API_KEY,
    ]);
    expect(thesubtitledbClient.canSearchWithoutCredential()).toBe(true);
    expect(thesubtitledbClient.canDownloadWithoutCredential()).toBe(true);
  });

  it('searches by id, not by video hash', () => {
    expect(thesubtitledbClient.isSearchHashSensitive).toBe(false);
  });

  it('declares the documented download limits', () => {
    expect(thesubtitledbClient.downloadBudgets).toEqual([
      {
        budgetScope: SubtitleSourceBudgetScope.SUBTITLE_SOURCE,
        windowMs: 3600000,
        requestMax: 1000,
      },
      {
        budgetScope: SubtitleSourceBudgetScope.CREDENTIAL,
        windowMs: 86400000,
        requestMax: 100000,
      },
    ]);
  });

  it('implements the search, download and credential check calls', () => {
    expect(thesubtitledbClient.searchSubtitles).toBeTypeOf('function');
    expect(thesubtitledbClient.downloadSubtitle).toBeTypeOf('function');
    expect(thesubtitledbClient.checkCredential).toBeTypeOf('function');
  });

  it('is registered with the subtitle source clients', () => {
    expect(listSubtitleSourceClients()).toContain(thesubtitledbClient);
  });
});
