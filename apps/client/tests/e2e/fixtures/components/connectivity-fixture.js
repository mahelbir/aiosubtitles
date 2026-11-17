'use client';

import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {QueryBoundary} from '@/components/common/query-boundary';
import {useIsOnline} from '@/hooks/use-is-online';
import {useFixtureFeed} from '../api';
import {FixtureSection} from './fixture-section';
import {FixtureState} from './fixture-state';

export function ConnectivityFixture() {
  const isOnline = useIsOnline();
  const [isFeedStarted, setIsFeedStarted] = useState(false);
  const feedQuery = useFixtureFeed({enabled: isFeedStarted});

  return (
    <>
      <FixtureSection title="Akış">
        <Button
          variant="outline"
          className="self-start"
          disabled={isFeedStarted}
          onClick={() => setIsFeedStarted(true)}
        >
          Akışı başlat
        </Button>
        {isFeedStarted && (
          <QueryBoundary query={feedQuery}>
            {feed => <p>{feed.message}</p>}
          </QueryBoundary>
        )}
      </FixtureSection>
      <FixtureState
        value={{
          isOnline,
          isFeedStarted,
          feed: {status: feedQuery.status, fetchStatus: feedQuery.fetchStatus},
        }}
      />
    </>
  );
}
