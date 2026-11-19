'use client';

import {useSelector} from '@tanstack/react-form';
import {RefreshCwIcon} from 'lucide-react';
import {CredentialStatus} from '@repo/shared/constants/credential.js';
import {LOADING_LABEL} from '@/components/common/loading-status';
import {Button} from '@/components/ui/button';
import {Spinner} from '@/components/ui/spinner';
import {useFormContext} from '@/lib/form-context';
import {useCheckUserConfigCredentials} from '../../api';
import {useStoredCredentials} from '../../hooks/use-stored-credentials';

const RECHECKED_CREDENTIAL_STATUSES = [
  CredentialStatus.UNCHECKED,
  CredentialStatus.LIMITED,
];

function CheckCredentialsAction() {
  const form = useFormContext();
  const isFormBusy = useSelector(
    form.store,
    state => state.isDirty || state.isSubmitting,
  );
  const checkMutation = useCheckUserConfigCredentials();

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="self-start"
      disabled={isFormBusy || checkMutation.isPending}
      onClick={() => checkMutation.mutate()}
    >
      {checkMutation.isPending ? (
        <Spinner data-icon="inline-start" aria-label={LOADING_LABEL} />
      ) : (
        <RefreshCwIcon data-icon="inline-start" />
      )}
      Check again
    </Button>
  );
}

export function CheckCredentialsButton({subtitleSource}) {
  const isRecheckable = useStoredCredentials().some(
    storedCredential =>
      storedCredential.subtitleSource === subtitleSource &&
      RECHECKED_CREDENTIAL_STATUSES.includes(storedCredential.credentialStatus),
  );
  return isRecheckable ? <CheckCredentialsAction /> : null;
}
