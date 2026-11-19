'use client';

import {useId} from 'react';
import {useSelector} from '@tanstack/react-form';
import {CredentialRequirement} from '@repo/shared/constants/subtitle-source.js';
import {
  hasListImprovementSwitch,
  isListImprovementCredential,
  isListImprovementOn,
} from '@repo/shared/lib/list-improvement-switch.js';
import {ExternalLinkButton} from '@/components/common/link-button';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import {Switch} from '@/components/ui/switch';
import {formatDateInput} from '@/lib/datetime';
import {useFormContext} from '@/lib/form-context';
import {SUBTITLE_SOURCE_DESCRIPTIONS} from '../../config/subtitle-source-descriptions';
import {isCredentialEntered} from '../../lib/credential-form-values';
import {setSubtitleSourceSwitch} from '../../lib/subtitle-source-switch-state';
import {CheckCredentialsButton} from './check-credentials-button';
import {CredentialList} from './credential-list';

function SwitchField({label, description, ...switchProps}) {
  const switchId = useId();
  const descriptionId = useId();

  return (
    <Field orientation="horizontal">
      <Switch
        {...switchProps}
        id={switchId}
        nativeButton
        render={<button type="button" />}
        aria-describedby={description ? descriptionId : undefined}
      />
      {description ? (
        <FieldContent>
          <FieldLabel htmlFor={switchId}>{label}</FieldLabel>
          <FieldDescription id={descriptionId}>{description}</FieldDescription>
        </FieldContent>
      ) : (
        <FieldLabel htmlFor={switchId}>{label}</FieldLabel>
      )}
    </Field>
  );
}

function readSourceSwitchDescription({isOn, isSearched}) {
  if (!isOn) {
    return 'Off: this source is skipped.';
  }
  return isSearched
    ? 'On: searched and downloaded for you.'
    : 'On: only subtitles others already downloaded. Add your key for new searches.';
}

function SourceSwitch({subtitleSource, label, credentialRequirement}) {
  const form = useFormContext();
  const isOn = useSelector(
    form.store,
    state => state.values.subtitleSourceSwitchStates[subtitleSource] ?? true,
  );
  const hasEnteredCredential = useSelector(form.store, state =>
    state.values.credentials.some(
      credential =>
        credential.subtitleSource === subtitleSource &&
        isCredentialEntered(credential),
    ),
  );
  const isSearched =
    credentialRequirement !== CredentialRequirement.REQUIRED ||
    hasEnteredCredential;

  return (
    <SwitchField
      label={label}
      description={readSourceSwitchDescription({isOn, isSearched})}
      checked={isOn}
      onCheckedChange={isChecked =>
        setSubtitleSourceSwitch(form, subtitleSource, isChecked)
      }
    />
  );
}

function ListImprovementSwitch({subtitleSource, description}) {
  const form = useFormContext();
  const hasEnteredCredential = useSelector(form.store, state =>
    state.values.credentials.some(
      credential =>
        credential.subtitleSource === subtitleSource &&
        isListImprovementCredential(credential) &&
        isCredentialEntered(credential),
    ),
  );
  const isOn = useSelector(form.store, state =>
    isListImprovementOn({
      listImprovementSwitchStates: state.values.listImprovementSwitchStates,
      subtitleSource,
    }),
  );

  if (!hasEnteredCredential) {
    return null;
  }

  return (
    <SwitchField
      label="Improve the list"
      description={description}
      checked={isOn}
      onCheckedChange={isChecked =>
        form.setFieldValue('listImprovementSwitchStates', switchStates => ({
          ...switchStates,
          [subtitleSource]: isChecked,
        }))
      }
    />
  );
}

function SourceHelp({helpText, keyPageUrl, limitPageUrl, limitCheckedDate}) {
  return (
    <div className="flex flex-col items-start gap-1">
      <p className="text-sm text-muted-foreground">{helpText}</p>
      {limitCheckedDate && (
        <p className="text-sm text-muted-foreground">
          {`Limits checked ${formatDateInput(limitCheckedDate)}.`}
        </p>
      )}
      {(keyPageUrl || limitPageUrl) && (
        <div className="flex flex-wrap gap-x-4">
          {keyPageUrl && (
            <ExternalLinkButton href={keyPageUrl}>Get a key</ExternalLinkButton>
          )}
          {limitPageUrl && (
            <ExternalLinkButton href={limitPageUrl}>
              See limits
            </ExternalLinkButton>
          )}
        </div>
      )}
    </div>
  );
}

export function SourcePanel({subtitleSourceOption}) {
  const {
    subtitleSource,
    label,
    credentialRequirement,
    credentialKinds,
    credentialLimit,
  } = subtitleSourceOption;
  const description = SUBTITLE_SOURCE_DESCRIPTIONS[subtitleSource];

  return (
    <FieldGroup>
      <SourceSwitch
        subtitleSource={subtitleSource}
        label={label}
        credentialRequirement={credentialRequirement}
      />
      {description && (
        <SourceHelp
          helpText={description.helpText}
          keyPageUrl={description.keyPageUrl}
          limitPageUrl={description.limitPageUrl}
          limitCheckedDate={description.limitCheckedDate}
        />
      )}
      {credentialKinds.map(credentialKind => (
        <CredentialList
          key={credentialKind}
          subtitleSource={subtitleSource}
          credentialKind={credentialKind}
          credentialLimit={credentialLimit}
          label={description?.credentialListLabels?.[credentialKind]}
        />
      ))}
      {hasListImprovementSwitch(subtitleSource) && (
        <ListImprovementSwitch
          subtitleSource={subtitleSource}
          description={description?.listImprovementText}
        />
      )}
      <CheckCredentialsButton subtitleSource={subtitleSource} />
    </FieldGroup>
  );
}
