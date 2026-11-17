import {Fragment} from 'react';
import {notFound} from 'next/navigation';
import {PageLoader} from '@/components/common/page-loader';
import {FixtureFrame} from '@tests/e2e/fixtures/components/fixture-frame';
import {FixtureToolkit} from '@tests/e2e/fixtures/components/fixture-toolkit';

export function FixturesLayout({children}) {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      <FixtureToolkit />
      {children}
    </main>
  );
}

export function FixturesLoading() {
  return <PageLoader />;
}

/**
 * @param {typeof import("@tests/e2e/fixtures/registry").FIXTURES} fixtures
 * @param {import("react").ElementType} [SessionGuard]
 * @returns {{
 *   generateStaticParams: function(): {name: string}[],
 *   generateMetadata: function({params: Promise<{name: string}>}): Promise<{title: string}>,
 *   FixturePage: function({params: Promise<{name: string}>}): Promise<import("react").ReactElement>,
 * }}
 */
export function createFixtureRoute(fixtures, SessionGuard = Fragment) {
  async function findFixture(params) {
    const {name} = await params;
    const fixture = fixtures.find(({slug}) => slug === name);
    if (!fixture) {
      notFound();
    }
    return fixture;
  }

  return {
    generateStaticParams() {
      return fixtures.map(({slug}) => ({name: slug}));
    },
    async generateMetadata({params}) {
      const {title} = await findFixture(params);
      return {title};
    },
    async FixturePage({params}) {
      const fixture = await findFixture(params);
      const Fixture = await fixture.load();
      const Guard = fixture.isSessionGuarded ? SessionGuard : Fragment;

      return (
        <FixtureFrame name={fixture.slug} title={fixture.title}>
          <Guard>
            <Fixture />
          </Guard>
        </FixtureFrame>
      );
    },
  };
}
