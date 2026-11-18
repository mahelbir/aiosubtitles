import {CredentialStatus} from '@repo/shared/constants/credential.js';
import {Badge} from '@/components/ui/badge';

const CREDENTIAL_STATUS_VARIANTS = Object.freeze({
  [CredentialStatus.UNCHECKED]: 'secondary',
  [CredentialStatus.VALID]: 'success',
  [CredentialStatus.INVALID]: 'destructive',
  [CredentialStatus.LIMITED]: 'warning',
});

export function CredentialStatusBadge({credentialStatus}) {
  return (
    <Badge variant={CREDENTIAL_STATUS_VARIANTS[credentialStatus]}>
      {CredentialStatus.label(credentialStatus)}
    </Badge>
  );
}
