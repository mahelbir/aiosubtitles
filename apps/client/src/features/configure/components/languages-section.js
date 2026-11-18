'use client';

import {SubtitleLanguage} from '@repo/shared/constants/subtitle-language.js';
import {
  SUBTITLE_LANGUAGE_LIMIT_MAX,
  SUBTITLE_LANGUAGE_LIMIT_MIN,
  USER_CONFIG_LANGUAGE_CODES_MAX,
} from '@repo/shared/constants/user-config.js';
import {PageSection} from '@/components/common/page-section';
import {ArrayInput, ArrayItemActions} from '@/components/form/array-input';
import {FormField} from '@/components/form/form-field';
import {FormGrid} from '@/components/form/form-grid';
import {NumberInput} from '@/components/form/number-input';
import {SelectInput} from '@/components/form/select-input';
import {getIntlFormatter} from '@/lib/intl';
import {optionSource} from '@/lib/option-source';

const languageSource = optionSource.fixed(
  SubtitleLanguage.toList().toSorted((first, second) =>
    getIntlFormatter(Intl.Collator).compare(first.label, second.label),
  ),
);

export function LanguagesSection() {
  return (
    <PageSection
      title="Languages"
      description="Subtitles come in this order. Add at least one language."
    >
      <FormGrid>
        <FormField name="languageCodes" mode="array">
          <ArrayInput
            max={USER_CONFIG_LANGUAGE_CODES_MAX}
            addLabel="Add language"
            createItem={() => null}
          >
            {({name, index}) => (
              <div className="flex items-end gap-2">
                <FormField name={name} className="min-w-0 flex-1">
                  <SelectInput
                    label={`Language ${index + 1}`}
                    source={languageSource}
                    placeholder="Choose a language…"
                  />
                </FormField>
                <ArrayItemActions />
              </div>
            )}
          </ArrayInput>
        </FormField>
        <FormField
          name="subtitleLanguageLimit"
          className="col-span-12 @md/field-group:col-span-6"
        >
          <NumberInput
            label="Subtitles per language"
            min={SUBTITLE_LANGUAGE_LIMIT_MIN}
            max={SUBTITLE_LANGUAGE_LIMIT_MAX}
          />
        </FormField>
      </FormGrid>
    </PageSection>
  );
}
