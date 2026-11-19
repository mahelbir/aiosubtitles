'use client';

import {useSelector} from '@tanstack/react-form';
import {compact, isEqual} from 'es-toolkit';
import {SubtitleLanguage} from '@repo/shared/constants/subtitle-language.js';
import {
  SUBTITLE_LANGUAGE_LIMIT_MAX,
  SUBTITLE_LANGUAGE_LIMIT_MIN,
  USER_CONFIG_LANGUAGE_CODES_MAX,
  USER_CONFIG_LANGUAGE_CODES_MIN,
} from '@repo/shared/constants/user-config.js';
import {PageSection} from '@/components/common/page-section';
import {ArrayInput, ArrayItemActions} from '@/components/form/array-input';
import {FormField} from '@/components/form/form-field';
import {FormGrid} from '@/components/form/form-grid';
import {NumberInput} from '@/components/form/number-input';
import {SelectInput} from '@/components/form/select-input';
import {useFormContext} from '@/lib/form-context';
import {getIntlFormatter} from '@/lib/intl';
import {optionSource} from '@/lib/option-source';
import {isSameText} from '@/lib/search';

function toLanguageLabel(label, nativeName) {
  return isSameText(label, nativeName) ? label : `${label} (${nativeName})`;
}

const languageOptions = SubtitleLanguage.toList({
  extra: ({value, label, raw}) => ({
    label: toLanguageLabel(label, raw.nativeName),
    keywords: compact([value, raw.iso6391]),
  }),
}).toSorted((first, second) =>
  getIntlFormatter(Intl.Collator).compare(first.label, second.label),
);

function LanguagePicker({name, index}) {
  const form = useFormContext();
  const otherCodes = useSelector(
    form.store,
    state => state.values.languageCodes.toSpliced(index, 1),
    {compare: isEqual},
  );
  const source = optionSource.fixed(
    languageOptions.filter(option => !otherCodes.includes(option.value)),
  );

  return (
    <FormField name={name} className="min-w-0 flex-1">
      <SelectInput
        label={`Language ${index + 1}`}
        source={source}
        placeholder="Choose a language…"
      />
    </FormField>
  );
}

export function LanguagesSection() {
  return (
    <PageSection
      title="Languages"
      description="Subtitles come in this order. Add at least one language."
    >
      <FormGrid>
        <FormField name="languageCodes" mode="array">
          <ArrayInput
            min={USER_CONFIG_LANGUAGE_CODES_MIN}
            max={USER_CONFIG_LANGUAGE_CODES_MAX}
            addLabel="Add language"
            createItem={() => null}
          >
            {({name, index}) => (
              <div className="flex items-end gap-2">
                <LanguagePicker name={name} index={index} />
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
