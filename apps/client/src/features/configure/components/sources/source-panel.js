'use client';

import {useId} from 'react';
import {useSelector} from '@tanstack/react-form';
import {ExternalLinkIcon} from 'lucide-react';
import {
  hasListImprovementSwitch,
  isListImprovementCredential,
  isListImprovementOn,
} from '@repo/shared/lib/list-improvement-switch.js';
import {isSubtitleSourceSwitchLocked} from '@repo/shared/lib/subtitle-source-switch.js';
import {LinkButton} from '@/components/common/link-button';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import {Switch} from '@/components/ui/switch';
import {useFormContext} from '@/lib/form-context';
import {SUBTITLE_SOURCE_DESCRIPTIONS} from '../../config/subtitle-source-descriptions';
import {isCredentialEntered} from '../../lib/credential-form-values';
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

function SourceSwitch({subtitleSource, label}) {
  const form = useFormContext();
  const isOn = useSelector(
    form.store,
    state => state.values.subtitleSourceSwitchStates[subtitleSource] ?? true,
  );
  const isLocked = useSelector(form.store, state =>
    isSubtitleSourceSwitchLocked({
      credentials: state.values.credentials.filter(
        credential => credential.subtitleSource === subtitleSource,
      ),
    }),
  );

  return (
    <SwitchField
      label={label}
      checked={isLocked || isOn}
      disabled={isLocked}
      onCheckedChange={isChecked =>
        form.setFieldValue('subtitleSourceSwitchStates', switchStates => ({
          ...switchStates,
          [subtitleSource]: isChecked,
        }))
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

function SourceHelp({helpText, keyPageUrl}) {
  return (
    <div className="flex flex-col items-start gap-1">
      <p className="text-sm text-muted-foreground">{helpText}</p>
      {keyPageUrl && (
        <LinkButton
          variant="link"
          size="sm"
          href={keyPageUrl}
          target="_blank"
          rel="noreferrer"
        >
          Get a key
          <ExternalLinkIcon data-icon="inline-end" />
        </LinkButton>
      )}
    </div>
  );
}

export function SourcePanel({subtitleSourceOption}) {
  const {subtitleSource, label, credentialKinds, credentialLimit} =
    subtitleSourceOption;
  const description = SUBTITLE_SOURCE_DESCRIPTIONS[subtitleSource];

  return (
    <FieldGroup>
      <SourceSwitch subtitleSource={subtitleSource} label={label} />
      {description && (
        <SourceHelp
          helpText={description.helpText}
          keyPageUrl={description.keyPageUrl}
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
