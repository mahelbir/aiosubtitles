'use client';

import {
  DescriptionList,
  DescriptionListDetails,
  DescriptionListItem,
  DescriptionListTerm,
} from '@/components/common/description-list';
import {PageHeader, PageHeaderSkeleton} from '@/components/common/page-header';
import {PageSection} from '@/components/common/page-section';
import {Button} from '@/components/ui/button';
import {FixtureSection} from './fixture-section';

const RECORD = [
  {term: 'Ad', details: 'Ada Yılmaz'},
  {term: 'E-posta', details: 'ada@example.com'},
  {term: 'Rol', details: 'Yönetici'},
  {term: 'Anahtar', details: 'a'.repeat(120)},
];

const WIDTHS = [
  {label: 'Dar liste', className: 'max-w-xs'},
  {label: 'Orta liste', className: 'max-w-lg'},
  {label: 'Geniş liste', className: 'max-w-4xl'},
];

export function DetailViewFixture() {
  return (
    <>
      <FixtureSection title="Başlıklar">
        <div data-testid="loaded-header">
          <PageHeader title="Ada Yılmaz" description="Kullanıcı ayrıntısı">
            <Button variant="outline">Düzenle</Button>
          </PageHeader>
        </div>
        <div data-testid="loading-header">
          <PageHeaderSkeleton description="Kullanıcı ayrıntısı">
            <Button variant="outline">Düzenle</Button>
          </PageHeaderSkeleton>
        </div>
      </FixtureSection>
      <FixtureSection title="Bölüm">
        <PageSection
          title="Oturumlar"
          description="Son girişler"
          actions={<Button variant="outline">Tümünü kapat</Button>}
        >
          <p>Bölüm içeriği.</p>
        </PageSection>
      </FixtureSection>
      <FixtureSection title="Açıklama listeleri">
        {WIDTHS.map(({label, className}) => (
          <div
            key={label}
            role="group"
            aria-label={label}
            className={className}
          >
            <RecordList />
          </div>
        ))}
        <div role="group" aria-label="Yatay liste">
          <RecordList orientation="horizontal" />
        </div>
      </FixtureSection>
    </>
  );
}

function RecordList({orientation}) {
  return (
    <DescriptionList orientation={orientation}>
      {RECORD.map(({term, details}) => (
        <DescriptionListItem key={term}>
          <DescriptionListTerm>{term}</DescriptionListTerm>
          <DescriptionListDetails>{details}</DescriptionListDetails>
        </DescriptionListItem>
      ))}
    </DescriptionList>
  );
}
