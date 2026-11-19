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

export function AllSourcesCheckbox({subtitleSources}) {
  const form = useFormContext();
  const checkboxId = useId();
  const switchStates = useSelector(
    form.store,
    state => state.values.subtitleSourceSwitchStates,
  );
  const switches = {switchStates, subtitleSources};
  const globalSwitchState = readGlobalSwitchState(switches);

  return (
    <Field orientation="horizontal">
      <Checkbox
        id={checkboxId}
        checked={globalSwitchState === GlobalSwitchState.ON}
        indeterminate={globalSwitchState === GlobalSwitchState.MIXED}
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
