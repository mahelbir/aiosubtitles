'use client';

import {useRef, useState} from 'react';
import {useLatest} from '@reactuses/core';
import {isEqual, noop} from 'es-toolkit';
import {SEARCH_MIN_LENGTH} from '@repo/shared/constants/pagination.js';
import {useOptionSource} from '@/hooks/use-option-source';
import {isSameText} from '@/lib/search';
import {getSelectionCap} from '@/lib/selection-cap';
import {
  OptionCombobox,
  OptionComboboxContent,
} from '@/components/form/option-combobox';
import {
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  useComboboxAnchor,
} from '@/components/ui/combobox';

const CREATE_ITEM = Object.freeze({});

function keepLocked(value, next, lockedKeys) {
  const valueKeys = new Set(value.map(String));
  const nextKeys = new Set(next.map(String));
  return [
    ...value.filter(
      item => nextKeys.has(String(item)) || lockedKeys.has(String(item)),
    ),
    ...next.filter(item => !valueKeys.has(String(item))),
  ];
}

function withCreateItem(optionList, text) {
  const label = `Create: "${text}"`;
  const createOption = {value: CREATE_ITEM, label};
  const {filter, labelOf} = optionList;
  return {
    ...optionList,
    known: [...optionList.known, createOption],
    listed: [...optionList.listed, createOption],
    filter:
      filter &&
      ((item, query, toLabel) =>
        item === CREATE_ITEM || filter(item, query, toLabel)),
    labelOf: item => (item === CREATE_ITEM ? label : labelOf(item)),
  };
}

export function ChipsCombobox({
  source,
  value,
  onValueChange,
  max,
  knownOptions,
  creatable,
  controlId,
  placeholder,
  describedBy,
  isInvalid,
  onBlur,
  ...props
}) {
  const anchor = useComboboxAnchor();
  const highlightedRef = useRef();
  const isCreatingRef = useRef(false);
  const latestValueRef = useLatest(value);
  const [search, setSearch] = useState('');

  const isFreeText = creatable !== undefined && !creatable.hasItem;
  const optionList = useOptionSource(source, {
    search,
    selected: isFreeText ? undefined : value,
    knownOptions,
  });
  const lockedKeys = new Set(
    optionList.known
      .filter(option => option.disabled)
      .map(option => String(option.value)),
  );
  const text = search.trim();
  const {isFull} = getSelectionCap(value, max);
  const isRemote = optionList.filter === null;
  const isCreateOffered =
    creatable?.hasItem === true &&
    text !== '' &&
    (!isRemote || text.length >= SEARCH_MIN_LENGTH) &&
    !optionList.isPending &&
    !optionList.hasFailed &&
    !optionList.known.some(option => isSameText(option.label, text));
  const comboboxList = isCreateOffered
    ? withCreateItem(optionList, text)
    : optionList;

  const addCreated = created => {
    const current = latestValueRef.current;
    const isCurrentFull = getSelectionCap(current, max).isFull;
    if (created !== undefined && !current.includes(created) && !isCurrentFull) {
      onValueChange([...current, created]);
    }
    setSearch('');
  };

  const create = () => {
    if (isCreatingRef.current) {
      return;
    }
    isCreatingRef.current = true;
    Promise.resolve()
      .then(() => creatable.onCreate(text))
      .then(addCreated, noop)
      .finally(() => {
        isCreatingRef.current = false;
      });
  };

  const handleValueChange = (next, details) => {
    if (next.includes(CREATE_ITEM)) {
      details.cancel();
      create();
      return;
    }
    const kept = keepLocked(value, next, lockedKeys);
    if (!isEqual(kept, value)) {
      onValueChange(kept);
    }
  };

  const handleKeyDown = event => {
    const isCommit =
      event.key === 'Enter' &&
      !event.nativeEvent.isComposing &&
      isFreeText &&
      highlightedRef.current === undefined;
    if (isCommit) {
      event.preventDefault();
      if (text !== '' && !isFull) {
        create();
      }
    }
  };

  return (
    <OptionCombobox
      optionList={comboboxList}
      multiple
      autoHighlight={!isFreeText}
      max={max}
      value={value}
      onValueChange={handleValueChange}
      inputValue={search}
      onInputValueChange={setSearch}
      onItemHighlighted={item => {
        highlightedRef.current = item;
      }}
      {...props}
    >
      <ComboboxChips ref={anchor}>
        {value.map(item => (
          <ComboboxChip
            key={String(item)}
            showRemove={!lockedKeys.has(String(item))}
            removeLabel={`Remove: ${optionList.labelOf(item)}`}
          >
            {optionList.labelOf(item)}
          </ComboboxChip>
        ))}
        <ComboboxChipsInput
          id={controlId}
          placeholder={value.length > 0 ? undefined : placeholder}
          aria-invalid={isInvalid}
          aria-describedby={describedBy}
          onBlur={onBlur}
          onKeyDown={handleKeyDown}
        />
      </ComboboxChips>
      <OptionComboboxContent anchor={anchor} />
    </OptionCombobox>
  );
}
