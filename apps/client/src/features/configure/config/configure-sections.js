import {Enum} from 'enum-plus';
import {DownloadIcon, LanguagesIcon, LayersIcon} from 'lucide-react';

export const ConfigureSection = Enum({
  SOURCES: {
    value: 'sources',
    label: 'Sources',
    icon: LayersIcon,
    fieldNames: ['subtitleSourceSwitchStates', 'credentials'],
  },
  LANGUAGES: {
    value: 'languages',
    label: 'Languages',
    icon: LanguagesIcon,
    fieldNames: ['languageCodes', 'subtitleLanguageLimit'],
  },
  INSTALL: {
    value: 'install',
    label: 'Install',
    icon: DownloadIcon,
    fieldNames: [],
  },
});

export const CONFIGURE_SECTIONS = ConfigureSection.toList({
  extra: ({raw}) => ({icon: raw.icon, fieldNames: raw.fieldNames}),
});

export function findFieldSection(fieldName) {
  return CONFIGURE_SECTIONS.find(section =>
    section.fieldNames.includes(fieldName),
  );
}
