'use client';

import {createContext, use} from 'react';
import {formatNumber} from '@/lib/intl';
import {toOptionSections} from '@/lib/option-section';
import {getSelectionCap} from '@/lib/selection-cap';
import {LOADING_LABEL} from '@/components/common/loading-status';
import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxFooter,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxSeparator,
  ComboboxStatus,
} from '@/components/ui/combobox';
import {Spinner} from '@/components/ui/spinner';

const OptionComboboxContext = createContext(null);

function toValues(options) {
  return options.map(option => option.value);
}

function toGroups(options) {
  return toOptionSections(options).map(section => ({
    key: section.key,
    items: toValues(section.items),
  }));
}

function isNearEnd(element) {
  return element.scrollHeight - element.scrollTop <= 2 * element.clientHeight;
}

export function OptionCombobox({optionList, value, max, children, ...props}) {
  const isFilteredHere = optionList.filter !== null;
  const isGrouped = optionList.known.some(option => option.group);
  const toItems = isGrouped ? toGroups : toValues;

  return (
    <OptionComboboxContext
      value={{...optionList, isGrouped, cap: getSelectionCap(value, max)}}
    >
      <Combobox
        autoHighlight
        items={toItems(isFilteredHere ? optionList.listed : optionList.known)}
        filteredItems={isFilteredHere ? undefined : toItems(optionList.listed)}
        filter={optionList.filter}
        itemToStringLabel={optionList.labelOf}
        value={value}
        {...props}
      >
        {children}
      </Combobox>
    </OptionComboboxContext>
  );
}

export function OptionComboboxContent({
  itemIndicator,
  actions,
  children,
  ...props
}) {
  const {
    known,
    listed,
    labelOf,
    isGrouped,
    isPending,
    pendingMessage,
    emptyMessage,
    matchTotal,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    cap,
  } = use(OptionComboboxContext);
  const disabledKeys = new Set(
    known.filter(option => option.disabled).map(option => String(option.value)),
  );
  const isItemDisabled = key => disabledKeys.has(key) || cap.isLocked(key);

  const renderItem = item => (
    <ComboboxItem
      key={String(item)}
      value={item}
      disabled={isItemDisabled(String(item))}
      indicator={itemIndicator}
    >
      {labelOf(item)}
    </ComboboxItem>
  );

  const renderGroup = group => (
    <ComboboxGroup key={group.key} items={group.items}>
      {group.key && <ComboboxLabel>{group.key}</ComboboxLabel>}
      <ComboboxCollection>{renderItem}</ComboboxCollection>
    </ComboboxGroup>
  );

  const loadNearEnd = event => {
    if (isNearEnd(event.currentTarget)) {
      fetchNextPage();
    }
  };

  return (
    <ComboboxContent {...props}>
      {children}
      <ComboboxStatus>{isPending && pendingMessage}</ComboboxStatus>
      <ComboboxStatus>{cap.message}</ComboboxStatus>
      <ComboboxEmpty>{!isPending && emptyMessage}</ComboboxEmpty>
      <ComboboxList onScroll={loadNearEnd}>
        <ComboboxCollection>
          {isGrouped ? renderGroup : renderItem}
        </ComboboxCollection>
        {actions}
      </ComboboxList>
      {hasNextPage && (
        <ComboboxFooter>
          {isFetchingNextPage && <Spinner aria-label={LOADING_LABEL} />}
          {`${formatNumber(listed.length)} / ${formatNumber(matchTotal)}`}
        </ComboboxFooter>
      )}
    </ComboboxContent>
  );
}

export function OptionComboboxClear({children}) {
  return (
    <>
      <ComboboxSeparator />
      <ComboboxItem value={null}>{children}</ComboboxItem>
    </>
  );
}

export function OptionComboboxSearch({placeholder = 'Ara…', ...props}) {
  return (
    <ComboboxInput
      showTrigger={false}
      placeholder={placeholder}
      aria-label="Ara"
      {...props}
    />
  );
}
