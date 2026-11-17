'use client';

import {useState} from 'react';
import {ChipsInput} from '@/components/form/chips-input';

export function CreatableMultiSelectInput({
  onCreate,
  knownOptions = [],
  ...props
}) {
  const [createdOptions, setCreatedOptions] = useState([]);

  const createOption = async text => {
    const option = await onCreate(text);
    setCreatedOptions(options => [...options, option]);
    return option.value;
  };

  return (
    <ChipsInput
      {...props}
      knownOptions={[...knownOptions, ...createdOptions]}
      creatable={{hasItem: true, onCreate: createOption}}
    />
  );
}
