import {FIXTURES} from '@tests/e2e/fixtures/registry';
import {createFixtureRoute} from '../../fixture-route.dev';

const {FixturePage, generateMetadata, generateStaticParams} =
  createFixtureRoute(FIXTURES.filter(fixture => !fixture.isSessionGuarded));

export {generateMetadata, generateStaticParams};

export default FixturePage;
