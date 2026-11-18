'use client';

import {useId} from 'react';
import {useSelector} from '@tanstack/react-form';
import {ExternalLinkIcon} from 'lucide-react';
import {isSubtitleSourceSwitchLocked} from '@repo/shared/lib/subtitle-source-switch.js';
import {LinkButton} from '@/components/common/link-button';
import {Field, FieldGroup, FieldLabel} from '@/components/ui/field';
import {Switch} from '@/components/ui/switch';
import {useFormContext} from '@/lib/form-context';
import {SUBTITLE_SOURCE_DESCRIPTIONS} from '../../config/subtitle-source-descriptions';
import {CheckCredentialsButton} from './check-credentials-button';
import {CredentialList} from './credential-list';

function SourceSwitch({subtitleSource, label}) {
  const form = useFormContext();
  const switchId = useId();
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
    <Field orientation="horizontal">
      <Switch
        id={switchId}
        nativeButton
        render={<button type="button" />}
        checked={isLocked || isOn}
        disabled={isLocked}
        onCheckedChange={isChecked =>
          form.setFieldValue('subtitleSourceSwitchStates', switchStates => ({
            ...switchStates,
            [subtitleSource]: isChecked,
          }))
        }
      />
      <FieldLabel htmlFor={switchId}>{label}</FieldLabel>
    </Field>
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
      <CheckCredentialsButton subtitleSource={subtitleSource} />
    </FieldGroup>
  );
}
