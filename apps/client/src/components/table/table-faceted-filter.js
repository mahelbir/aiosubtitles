'use client';

import {useState} from 'react';
import {mergeProps} from '@base-ui/react/merge-props';
import {CirclePlusIcon} from 'lucide-react';
import {keyBy, uniqBy} from 'es-toolkit';
import {MAX_FILTER_VALUES} from '@repo/shared/constants/pagination.js';
import {useHeldWhileOpen} from '@/hooks/use-held-while-open';
import {useOptionSource} from '@/hooks/use-option-source';
import {useRemountFocus} from '@/hooks/use-remount-focus';
import {
  OptionCombobox,
  OptionComboboxClear,
  OptionComboboxContent,
  OptionComboboxSearch,
} from '@/components/form/option-combobox';
import {
  OptionSelect,
  OptionSelectClear,
  OptionSelectContent,
} from '@/components/form/option-select';
import {Badge} from '@/components/ui/badge';
import {ComboboxTrigger} from '@/components/ui/combobox';
import {SelectTrigger} from '@/components/ui/select';
import {Separator} from '@/components/ui/separator';
import {FilterClear} from './filter-clear';
import {useTableContext} from './table-provider';

const MAX_VISIBLE_BADGES = 2;
const NO_VALUES = [];
const CLEAR_LABEL = 'Clear filter';

function getOptionKey(option) {
  return String(option.value);
}

function pinSelected(optionList, pinned) {
  if (pinned.length === 0) {
    return optionList;
  }
  const pinnedKeys = new Set(pinned.map(String));
  const knownByKey = keyBy(optionList.known, getOptionKey);
  const pinnedOptions = pinned.map(
    value =>
      knownByKey[String(value)] ?? {value, label: optionList.labelOf(value)},
  );
  return {
    ...optionList,
    known: uniqBy([...optionList.known, ...pinnedOptions], getOptionKey),
    listed: [
      ...pinnedOptions,
      ...optionList.listed.filter(
        option => !pinnedKeys.has(getOptionKey(option)),
      ),
    ],
  };
}

export function TableFacetedFilter({
  name,
  title,
  source,
  multiple = true,
  isSearchable,
  max = MAX_FILTER_VALUES,
}) {
  const {list} = useTableContext();
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [pinned, setPinned] = useState(NO_VALUES);
  const [isPinnedView, setIsPinnedView] = useState(false);
  const focusProps = useRemountFocus();
  const current = list.query[name];
  const selected = Array.isArray(current) ? current : NO_VALUES;
  const optionList = useOptionSource(source, {search, selected});
  const comboboxShown = useHeldWhileOpen(
    isSearchable ?? optionList.isSearchable,
  );

  const isUnfiltered = isOpen && search === '';
  if (isUnfiltered !== isPinnedView) {
    setIsPinnedView(isUnfiltered);
    if (isUnfiltered) {
      setPinned(selected);
    }
  }

  const apply = values =>
    list.setFilter({[name]: values.length > 0 ? values : null});

  const changeValue = next => {
    const values = multiple ? next : [next];
    if (values.includes(null)) {
      setIsOpen(false);
      apply(NO_VALUES);
      return;
    }
    apply(values);
  };

  const canPin =
    search === '' && !optionList.isPending && !optionList.hasFailed;
  const rootProps = mergeProps(comboboxShown.popupProps, {
    optionList: canPin ? pinSelected(optionList, pinned) : optionList,
    multiple,
    max: multiple ? max : undefined,
    value: multiple ? selected : (selected[0] ?? null),
    open: isOpen,
    onOpenChange: open => setIsOpen(open),
    onValueChange: changeValue,
  });
  const triggerProps = mergeProps(focusProps, comboboxShown.triggerProps, {
    variant: 'button',
    className: 'border-dashed',
    'aria-label':
      selected.length > 0 ? `${title}, ${selected.length} selected` : title,
  });
  const contentProps = {
    align: 'start',
    className: 'w-52',
    itemIndicator: multiple ? 'checkbox' : 'check',
  };
  const canClear = selected.length > 0 && search === '';
  const summary = (
    <FacetSummary
      title={title}
      badges={selected.map(value => ({
        key: String(value),
        label: optionList.labelOf(value),
      }))}
      onReset={() => apply(NO_VALUES)}
    />
  );

  if (comboboxShown.value) {
    return (
      <OptionCombobox {...rootProps} onInputValueChange={setSearch}>
        <ComboboxTrigger {...triggerProps}>{summary}</ComboboxTrigger>
        <OptionComboboxContent
          {...contentProps}
          actions={
            canClear && <OptionComboboxClear>{CLEAR_LABEL}</OptionComboboxClear>
          }
        >
          <OptionComboboxSearch placeholder={`${title}…`} />
        </OptionComboboxContent>
      </OptionCombobox>
    );
  }
  return (
    <OptionSelect {...rootProps}>
      <SelectTrigger {...triggerProps}>{summary}</SelectTrigger>
      <OptionSelectContent
        {...contentProps}
        alignItemWithTrigger={false}
        actions={
          canClear && <OptionSelectClear>{CLEAR_LABEL}</OptionSelectClear>
        }
      />
    </OptionSelect>
  );
}

function FacetSummary({title, badges, onReset}) {
  const count = badges.length;

  return (
    <>
      {count > 0 ? (
        <FilterClear title={title} onReset={onReset} />
      ) : (
        <CirclePlusIcon data-icon="inline-start" />
      )}
      {title}
      {count > 0 && (
        <>
          <Separator
            orientation="vertical"
            className="mx-0.5 data-vertical:h-4"
          />
          <Badge variant="secondary" className="rounded-sm px-1 md:hidden">
            {count}
          </Badge>
          <span className="hidden items-center gap-1 md:flex">
            {count > MAX_VISIBLE_BADGES ? (
              <Badge variant="secondary" className="rounded-sm px-1">
                {count} selected
              </Badge>
            ) : (
              badges.map(badge => (
                <Badge
                  key={badge.key}
                  variant="secondary"
                  className="rounded-sm px-1"
                >
                  {badge.label}
                </Badge>
              ))
            )}
          </span>
        </>
      )}
    </>
  );
}
