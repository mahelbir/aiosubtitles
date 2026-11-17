'use client';

import {createContext, use, useId} from 'react';
import {SearchIcon} from 'lucide-react';
import {cn} from 'cn';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group';
import {Label} from '@/components/ui/label';
import {getInputTypeProps} from '@/lib/form';
import {useTableContext} from './table-provider';

const tableSearchContext = createContext(null);

export function TableSearch({children}) {
  const id = useId();
  return (
    <tableSearchContext.Provider value={id}>
      {children}
    </tableSearchContext.Provider>
  );
}

export function TableSearchLabel({className, ...props}) {
  const id = use(tableSearchContext);
  return <Label htmlFor={id} className={className} {...props} />;
}

export function TableSearchInput({
  className,
  placeholder = 'Search…',
  ...props
}) {
  const id = use(tableSearchContext);
  const {list} = useTableContext();
  return (
    <InputGroup className={cn('w-40 lg:w-56', className)}>
      <InputGroupAddon>
        <SearchIcon />
      </InputGroupAddon>
      <InputGroupInput
        id={id}
        type="search"
        {...getInputTypeProps('search')}
        placeholder={placeholder}
        {...props}
        value={list.searchInput}
        onChange={event => list.setSearchInput(event.target.value)}
      />
    </InputGroup>
  );
}
