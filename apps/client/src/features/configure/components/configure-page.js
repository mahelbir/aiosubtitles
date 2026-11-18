'use client';

import {withQuery} from '@repo/shared/lib/url-query.js';
import {LinkButton} from '@/components/common/link-button';
import {PageLoader} from '@/components/common/page-loader';
import {QueryBoundary} from '@/components/common/query-boundary';
import {useUserConfig} from '../api';
import {
  CONFIGURE_PATH,
  SIGN_IN_VIEW,
  useConfigureQuery,
} from '../hooks/use-configure-query';
import {useUserConfigSessionToken} from '../hooks/use-user-config-session';
import {LoadedConfigureForm, NewConfigureForm} from './configure-form';
import {OpenUserConfigCard, SignInCard} from './sign-in-card';

function NewConfigure() {
  return (
    <>
      <NewConfigureForm />
      <div className="flex justify-center px-4 pb-8">
        <LinkButton
          variant="link"
          href={withQuery(CONFIGURE_PATH, {view: SIGN_IN_VIEW})}
        >
          I already have a configuration
        </LinkButton>
      </div>
    </>
  );
}

function ConfigureContent() {
  const [{userConfigId, view}] = useConfigureQuery();
  const sessionToken = useUserConfigSessionToken(userConfigId);
  const userConfigQuery = useUserConfig(userConfigId, {
    enabled: Boolean(userConfigId && sessionToken),
  });

  if (sessionToken === undefined) {
    return <PageLoader />;
  }
  if (!userConfigId) {
    return view === SIGN_IN_VIEW ? <OpenUserConfigCard /> : <NewConfigure />;
  }
  if (userConfigQuery.data) {
    return <LoadedConfigureForm userConfig={userConfigQuery.data} />;
  }
  if (!sessionToken) {
    return <SignInCard userConfigId={userConfigId} />;
  }
  return (
    <QueryBoundary query={userConfigQuery}>
      {userConfig => <LoadedConfigureForm userConfig={userConfig} />}
    </QueryBoundary>
  );
}

export function ConfigurePage() {
  return (
    <main className="flex min-h-svh flex-col">
      <ConfigureContent />
    </main>
  );
}
