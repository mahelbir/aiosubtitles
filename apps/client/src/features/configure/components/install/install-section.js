import {PageSection} from '@/components/common/page-section';
import {ChangePasswordCard} from './change-password-card';
import {DeleteConfigurationCard} from './delete-configuration-card';
import {ManifestLinkCard} from './manifest-link-card';

const INSTALL_TITLE = 'Install';

export function InstallSection({manifestUrl}) {
  return (
    <PageSection
      title={INSTALL_TITLE}
      description="Add this link to Stremio to use your subtitle settings."
    >
      <div className="flex flex-col gap-6">
        <ManifestLinkCard manifestUrl={manifestUrl} />
        <ChangePasswordCard />
        <DeleteConfigurationCard />
      </div>
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
