import {CredentialStatus} from '@repo/shared/constants/credential.js';
import {markCredentialStatus} from './credential-secret.js';
import {openSubtitleSourceBreaker} from './subtitle-search/subtitle-source-breaker.js';
import {toBudgetRecoveryWindowMs} from './subtitle-search/subtitle-source-budget.js';
import {
  SourceCredentialError,
  SourceRateLimitError,
} from './subtitle-sources/subtitle-source-errors.js';

export async function recordSubtitleSourceFailure({client, error, nowMs}) {
  const rejectedStatus = toRejectedCredentialStatus(error);
  if (rejectedStatus) {
    await markCredentialStatus({
      credentialId: error.credentialId,
      credentialStatus: rejectedStatus,
    });
    return true;
  }
  if (error instanceof SourceRateLimitError) {
    await openSubtitleSourceBreaker({
      subtitleSource: client.subtitleSource,
      retryAfterMs: error.retryAfterMs,
      nowMs,
      recoveryWindowMs: toBudgetRecoveryWindowMs(client.downloadBudgets),
      isKeylessOnly:
        error.isKeylessCall && client.isKeylessLimitSeparate === true,
    });
  }
  return false;
}

function toRejectedCredentialStatus(error) {
  if (!error?.credentialId) {
    return null;
  }
  if (error instanceof SourceCredentialError) {
    return CredentialStatus.INVALID;
  }
  if (error instanceof SourceRateLimitError) {
    return CredentialStatus.LIMITED;
  }
  return null;
}
