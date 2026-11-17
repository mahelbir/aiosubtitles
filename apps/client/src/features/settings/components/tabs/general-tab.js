'use client';

import {GlobeIcon} from 'lucide-react';
import {FormField} from '@/components/form/form-field.js';
import {AlignedCheckboxInput} from '@/components/form/checkbox-input';
import {TextInput} from '@/components/form/text-input';

const fields = {
  name: {label: 'Uygulama Adı'},
  job: {
    label: 'İş',
    fields: {
      count: {label: 'İş Sayısı'},
      isEnabled: {label: 'İş Aktif'},
    },
  },
};

function Panel() {
  return (
    <>
      <FormField name="name">
        <TextInput label={fields.name.label} />
      </FormField>
      <FormField
        name="job.count"
        className="col-span-12 @md/field-group:col-span-6"
      >
        <TextInput label={fields.job.fields.count.label} type="number" />
      </FormField>
      <FormField
        name="job.isEnabled"
        className="col-span-12 @md/field-group:col-span-6"
      >
        <AlignedCheckboxInput label={fields.job.fields.isEnabled.label} />
      </FormField>
    </>
  );
}

export const generalTab = {
  key: 'general',
  title: 'Genel',
  Icon: GlobeIcon,
  Panel,
  fields,
};
