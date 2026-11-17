'use client';

import {CodeViewer} from '@/components/common/code-viewer';
import {FixtureSection} from './fixture-section';

const RESPONSE_JSON = JSON.stringify(
  {
    status: 'ok',
    items: Array.from({length: 30}, (_, index) => ({
      id: index + 1,
      name: `Kayıt ${index + 1}`,
    })),
  },
  null,
  2,
);

const LOG = 'Bağlantı kuruldu.\nİstek gönderildi.\nYanıt alındı.';

export function CodeViewerFixture() {
  return (
    <>
      <FixtureSection title="JSON yanıt">
        <CodeViewer value={RESPONSE_JSON} language="json" title="Yanıt" />
      </FixtureSection>
      <FixtureSection title="Düz metin">
        <CodeViewer value={LOG} title="Günlük" />
      </FixtureSection>
    </>
  );
}
