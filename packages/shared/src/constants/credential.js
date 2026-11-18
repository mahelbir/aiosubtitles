import {Enum} from 'enum-plus';

export const CredentialKind = Enum({
  API_KEY: {
    value: 'api-key',
    label: 'API key',
    credentialSecretParts: ['apiKey'],
  },
  ACCOUNT: {
    value: 'account',
    label: 'Account',
    credentialSecretParts: ['username', 'password'],
  },
  ACCESS_TOKEN: {
    value: 'access-token',
    label: 'Access token',
    credentialSecretParts: ['accessToken'],
  },
});

export const CredentialStatus = Enum({
  UNCHECKED: {value: 'unchecked', label: 'Not checked'},
  VALID: {value: 'valid', label: 'Valid'},
  INVALID: {value: 'invalid', label: 'Invalid key'},
  LIMITED: {value: 'limited', label: 'Limit reached'},
});
