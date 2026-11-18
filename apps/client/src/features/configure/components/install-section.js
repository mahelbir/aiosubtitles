import {PageSection} from '@/components/common/page-section';

const INSTALL_TITLE = 'Install';

export function InstallSection({manifestUrl}) {
  return (
    <PageSection
      title={INSTALL_TITLE}
      description="Add this link to Stremio to use your subtitle settings."
    >
      <code className="rounded-lg border bg-muted px-3 py-2 font-mono text-sm break-all">
        {manifestUrl}
      </code>
    </PageSection>
  );
}

export function NewInstallSection() {
  return (
    <PageSection
      title={INSTALL_TITLE}
      description="Save to get your install link."
    />
  );
}
