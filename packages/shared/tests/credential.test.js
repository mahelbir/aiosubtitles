import {describe, expect, it} from 'vitest';
import {CredentialKind, CredentialStatus} from '../src/constants/credential.js';

function toValueLabelPairs(enumType) {
  return enumType.toList().map(({value, label}) => [value, label]);
}

describe('CredentialKind', () => {
  it('lists an API key, an account and an access token', () => {
    expect(toValueLabelPairs(CredentialKind)).toEqual([
      ['api-key', 'API key'],
      ['account', 'Account'],
      ['access-token', 'Access token'],
    ]);
  });

  it('names the parts of each secret', () => {
    expect(
      CredentialKind.values.map(
        credentialKind =>
          CredentialKind.item(credentialKind).credentialSecretParts,
      ),
    ).toEqual([['apiKey'], ['username', 'password'], ['accessToken']]);
  });

  it('names members in constant case', () => {
    expect(CredentialKind.API_KEY).toBe('api-key');
    expect(CredentialKind.ACCOUNT).toBe('account');
    expect(CredentialKind.ACCESS_TOKEN).toBe('access-token');
  });
});

describe('CredentialStatus', () => {
  it('labels every status as the Sources tab shows it', () => {
    expect(toValueLabelPairs(CredentialStatus)).toEqual([
      ['unchecked', 'Not checked'],
      ['valid', 'Valid'],
      ['invalid', 'Invalid key'],
      ['limited', 'Limit reached'],
    ]);
  });

  it('names members in constant case', () => {
    expect(CredentialStatus.UNCHECKED).toBe('unchecked');
    expect(CredentialStatus.VALID).toBe('valid');
    expect(CredentialStatus.INVALID).toBe('invalid');
    expect(CredentialStatus.LIMITED).toBe('limited');
  });
});
