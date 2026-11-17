import {RequireSession} from '@/features/auth/components/require-session';
import {createFixtureRoute} from '@/app/(public)/(fixtures)/fixture-route.dev';
import {FIXTURES} from '@tests/e2e/fixtures/registry';

const {FixturePage, generateMetadata, generateStaticParams} =
  createFixtureRoute(FIXTURES, SessionGuard);

export {generateMetadata, generateStaticParams};

export default FixturePage;

function SessionGuard({children}) {
  return (
    <RequireSession loginRoute="/admin/fixtures">{children}</RequireSession>
  );
}
