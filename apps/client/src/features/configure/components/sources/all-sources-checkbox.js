'use client';

import {useId} from 'react';
import {useSelector} from '@tanstack/react-form';
import {GlobalSwitchState} from '@repo/shared/constants/subtitle-source.js';
import {
  applyGlobalSwitch,
  readGlobalSwitchState,
} from '@repo/shared/lib/subtitle-source-switch.js';
import {Checkbox} from '@/components/ui/checkbox';
import {Field, FieldLabel} from '@/components/ui/field';
import {useFormContext} from '@/lib/form-context';

export function AllSourcesCheckbox({subtitleSources, lockedSubtitleSources}) {
  const form = useFormContext();
  const checkboxId = useId();
  const switchStates = useSelector(
    form.store,
    state => state.values.subtitleSourceSwitchStates,
  );
  const switches = {switchStates, lockedSubtitleSources, subtitleSources};
  const globalSwitchState = readGlobalSwitchState(switches);
  const isEverySourceLocked = subtitleSources.every(subtitleSource =>
    lockedSubtitleSources.includes(subtitleSource),
  );

  return (
    <Field orientation="horizontal" data-disabled={isEverySourceLocked}>
      <Checkbox
        id={checkboxId}
        checked={globalSwitchState === GlobalSwitchState.ON}
        indeterminate={globalSwitchState === GlobalSwitchState.MIXED}
        disabled={isEverySourceLocked}
        onCheckedChange={() =>
          form.setFieldValue(
            'subtitleSourceSwitchStates',
            applyGlobalSwitch(switches),
          )
        }
      />
      <FieldLabel htmlFor={checkboxId}>All sources</FieldLabel>
    </Field>
  );
}
