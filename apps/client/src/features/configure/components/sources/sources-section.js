'use client';

import {useSelector} from '@tanstack/react-form';
import {sortBy, uniq} from 'es-toolkit';
import {CredentialStatus} from '@repo/shared/constants/credential.js';
import {
  CredentialRequirement,
  SubtitleSource,
} from '@repo/shared/constants/subtitle-source.js';
import {isSubtitleSourceSwitchLocked} from '@repo/shared/lib/subtitle-source-switch.js';
import {PageSection} from '@/components/common/page-section';
import {QueryBoundary} from '@/components/common/query-boundary';
import {TabMenuCard} from '@/components/common/tab-menu';
import {useTabQuery} from '@/hooks/use-tab-query';
import {useFormContext} from '@/lib/form-context';
import {useSubtitleSources} from '../../api';
import {SUBTITLE_SOURCE_TAB_URL_KEY} from '../../config/configure-sections';
import {useStoredCredentials} from '../../hooks/use-stored-credentials';
import {AllSourcesCheckbox} from './all-sources-checkbox';
import {SourcePanel} from './source-panel';

const SUBTITLE_SOURCE_ORDER = [
  SubtitleSource.SUBDL,
  SubtitleSource.SUBSOURCE,
  SubtitleSource.WYZIE,
  SubtitleSource.THESUBTITLEDB,
  SubtitleSource.STREMIO_COMMUNITY_SUBTITLES,
  SubtitleSource.ALTYAZIDB,
  SubtitleSource.OPENSUBTITLES,
  SubtitleSource.BETASERIES,
  SubtitleSource.JIMAKU,
  SubtitleSource.ANISUB,
  SubtitleSource.OPENSUBTITLES_V3,
  SubtitleSource.YIFY,
  SubtitleSource.GESTDOWN,
  SubtitleSource.TVSUBTITLES,
  SubtitleSource.ANIMETOSHO,
];

// Sources that require a credential come first, then optional, then none, each group from most to least known.
function sortSubtitleSourceOptions(subtitleSourceOptions) {
  return sortBy(subtitleSourceOptions, [
    ({credentialRequirement}) =>
      CredentialRequirement.values.indexOf(credentialRequirement),
    ({subtitleSource}) => {
      const position = SUBTITLE_SOURCE_ORDER.indexOf(subtitleSource);
      return position === -1 ? SUBTITLE_SOURCE_ORDER.length : position;
    },
  ]);
}

function SourceTabs({subtitleSourceOptions}) {
  const form = useFormContext();
  const credentials = useSelector(
    form.store,
    state => state.values.credentials,
  );
  const storedCredentials = useStoredCredentials();
  const items = subtitleSourceOptions.map(({subtitleSource, label}) => ({
    value: subtitleSource,
    label,
  }));
  const [subtitleSourceTab, setSubtitleSourceTab] = useTabQuery(items, {
    urlKey: SUBTITLE_SOURCE_TAB_URL_KEY,
  });
  const subtitleSources = subtitleSourceOptions.map(
    ({subtitleSource}) => subtitleSource,
  );
  const lockedSubtitleSources = subtitleSources.filter(subtitleSource =>
    isSubtitleSourceSwitchLocked({
      credentials: credentials.filter(
        credential => credential.subtitleSource === subtitleSource,
      ),
    }),
  );
  const invalidSubtitleSources = uniq(
    storedCredentials
      .filter(
        ({credentialStatus}) => credentialStatus === CredentialStatus.INVALID,
      )
      .map(({subtitleSource}) => subtitleSource),
  );

  return (
    <>
      <AllSourcesCheckbox
        subtitleSources={subtitleSources}
        lockedSubtitleSources={lockedSubtitleSources}
      />
      <TabMenuCard
        items={items}
        value={subtitleSourceTab}
        onValueChange={setSubtitleSourceTab}
        invalidValues={invalidSubtitleSources}
      >
        {({value}) => (
          <SourcePanel
            subtitleSourceOption={subtitleSourceOptions.find(
              ({subtitleSource}) => subtitleSource === value,
            )}
          />
        )}
      </TabMenuCard>
    </>
  );
}

export function SourcesSection() {
  const subtitleSourcesQuery = useSubtitleSources({
    select: sortSubtitleSourceOptions,
  });

  return (
    <PageSection
      title="Sources"
      description="Subtitles come from every source you have not turned off."
    >
      <QueryBoundary query={subtitleSourcesQuery}>
        {subtitleSourceOptions => (
          <SourceTabs subtitleSourceOptions={subtitleSourceOptions} />
        )}
      </QueryBoundary>
    </PageSection>
  );
}
