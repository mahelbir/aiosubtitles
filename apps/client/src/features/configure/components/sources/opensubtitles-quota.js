'use client';

import {sumBy} from 'es-toolkit';
import {formatNumber, getIntlFormatter} from '@/lib/intl';
import {timestamp, toDate} from '@/lib/datetime';
import {useStoredCredentials} from '../../hooks/use-stored-credentials';

const DOWNLOAD_NOUNS = Object.freeze({one: 'download', other: 'downloads'});

function toDownloadsLeftText(quotaRemainingCount) {
  const pluralCategory = getIntlFormatter(Intl.PluralRules).select(
    quotaRemainingCount,
  );
  const noun = DOWNLOAD_NOUNS[pluralCategory] ?? DOWNLOAD_NOUNS.other;
  return `${formatNumber(quotaRemainingCount)} ${noun} left today`;
}

function hasQuota({quotaRemainingCount, quotaResetAt}) {
  const resetAt = toDate(quotaResetAt);
  return (
    quotaRemainingCount !== null &&
    (resetAt === null || resetAt.getTime() > timestamp('ms'))
  );
}

export function CredentialQuota({storedCredential}) {
  return hasQuota(storedCredential) ? (
    <span className="text-sm text-muted-foreground">
      {toDownloadsLeftText(storedCredential.quotaRemainingCount)}
    </span>
  ) : null;
}

export function CredentialQuotaTotal({subtitleSource, credentialKind}) {
  const storedCredentials = useStoredCredentials().filter(
    storedCredential =>
      storedCredential.subtitleSource === subtitleSource &&
      storedCredential.credentialKind === credentialKind,
  );
  const quotaCredentials = storedCredentials.filter(hasQuota);
  if (storedCredentials.length < 2 || quotaCredentials.length === 0) {
    return null;
  }
  return (
    <p className="text-sm text-muted-foreground">
      {`${toDownloadsLeftText(sumBy(quotaCredentials, ({quotaRemainingCount}) => quotaRemainingCount))} in total`}
    </p>
  );
}
