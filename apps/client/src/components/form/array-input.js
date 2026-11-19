'use client';

import {createContext, use, useId, useRef, useState} from 'react';
import {uniqueId} from 'es-toolkit/compat';
import {
  ChevronDownIcon,
  ChevronUpIcon,
  PlusIcon,
  Trash2Icon,
} from 'lucide-react';
import {cn} from 'cn';
import {useAutoAnimate} from '@/hooks/use-auto-animate';
import {useFieldControl} from '@/lib/form-context';
import {TooltipIconButton} from '@/components/common/icon-button';
import {FieldMessage} from '@/components/form/field-message';
import {Button} from '@/components/ui/button';
import {Field, FieldGroup, FieldLegend, FieldSet} from '@/components/ui/field';

const ArrayItemContext = createContext(null);

const createItemKeys = count => Array.from({length: count}, () => uniqueId());

const fitItemKeys = (keys, count) =>
  keys.length > count
    ? keys.slice(0, count)
    : [...keys, ...createItemKeys(count - keys.length)];

const keepEveryItem = () => true;

function ArrayListInput({
  label,
  'aria-label': ariaLabel,
  help,
  className,
  min = 0,
  max = Infinity,
  addLabel = 'Add',
  disabled,
  readOnly,
  filter,
  listId,
  createItem,
  children,
}) {
  const {field, error, messageId, describedBy, handleBlur} = useFieldControl({
    help,
    props: {disabled},
  });
  const listMessageId = listId ? `${messageId}-${listId}` : messageId;
  const listDescribedBy = describedBy && listMessageId;
  const listRef = useAutoAnimate();
  const itemNodes = useRef(new Map());
  const addRef = useRef(null);
  const itemIndexes = (field.state.value ?? []).flatMap((item, index) =>
    filter(item) ? [index] : [],
  );
  const count = itemIndexes.length;
  const [storedKeys, setStoredKeys] = useState(() => createItemKeys(count));
  const itemKeys =
    storedKeys.length === count ? storedKeys : fitItemKeys(storedKeys, count);
  if (itemKeys !== storedKeys) {
    setStoredKeys(itemKeys);
  }

  const registerItem = (itemKey, node) => {
    itemNodes.current.set(itemKey, node);
    return () => itemNodes.current.delete(itemKey);
  };

  const focusItemAction = (itemKey, actions) =>
    window.requestAnimationFrame(() => {
      const item = itemNodes.current.get(itemKey);
      const target = actions
        .map(action => item?.querySelector(`[data-array-action="${action}"]`))
        .find(button => button && !button.disabled);
      (target ?? addRef.current)?.focus();
    });

  const revalidateItemsFrom = index =>
    window.requestAnimationFrame(() =>
      field.form.validateArrayFieldsStartingFrom(field.name, index, 'change'),
    );

  const moveItem = (from, to) => {
    const step = Math.sign(to - from);
    for (let position = from; position !== to; position += step) {
      field.swapValues(itemIndexes[position], itemIndexes[position + step]);
    }
    setStoredKeys(itemKeys.toSpliced(from, 1).toSpliced(to, 0, itemKeys[from]));
    revalidateItemsFrom(itemIndexes[Math.min(from, to)]);
    focusItemAction(
      itemKeys[from],
      to < from ? ['up', 'down'] : ['down', 'up'],
    );
  };

  const removeItem = index => {
    const keptKeys = itemKeys.toSpliced(index, 1);
    field.removeValue(itemIndexes[index]);
    setStoredKeys(keptKeys);
    focusItemAction(keptKeys[Math.min(index, keptKeys.length - 1)], ['remove']);
  };

  return (
    <Field
      className={className}
      data-invalid={Boolean(error)}
      data-disabled={disabled}
    >
      <FieldSet disabled={disabled} aria-label={ariaLabel}>
        {label && <FieldLegend variant="label">{label}</FieldLegend>}
        <FieldGroup ref={listRef} className="gap-3 *:shrink-0">
          {itemKeys.map((itemKey, index) => (
            <ArrayItemContext.Provider
              key={itemKey}
              value={{
                index,
                count,
                itemKey,
                readOnly,
                canRemove: count > min,
                registerItem,
                moveItem,
                removeItem,
              }}
            >
              {children({name: `${field.name}[${itemIndexes[index]}]`, index})}
            </ArrayItemContext.Provider>
          ))}
          <div>
            <Button
              ref={addRef}
              type="button"
              variant="outline"
              size="sm"
              disabled={readOnly || count >= max}
              onClick={() => field.pushValue(createItem())}
              onBlur={handleBlur}
              aria-invalid={Boolean(error)}
              aria-describedby={listDescribedBy}
            >
              <PlusIcon data-icon="inline-start" />
              {addLabel}
            </Button>
          </div>
        </FieldGroup>
      </FieldSet>
      <FieldMessage id={listMessageId} error={error} help={help} />
    </Field>
  );
}

export function ArrayInput(props) {
  return <ArrayListInput {...props} filter={keepEveryItem} />;
}

export function FilteredArrayInput(props) {
  const listId = useId();
  return <ArrayListInput {...props} listId={listId} />;
}

export function ArrayItemActions({className}) {
  const {
    index,
    count,
    itemKey,
    readOnly,
    canRemove,
    registerItem,
    moveItem,
    removeItem,
  } = use(ArrayItemContext);

  return (
    <div
      ref={node => registerItem(itemKey, node)}
      className={cn('flex shrink-0 gap-1', className)}
    >
      <TooltipIconButton
        variant="ghost"
        title="Move up"
        data-array-action="up"
        disabled={readOnly || index === 0}
        onClick={() => moveItem(index, index - 1)}
      >
        <ChevronUpIcon />
      </TooltipIconButton>
      <TooltipIconButton
        variant="ghost"
        title="Move down"
        data-array-action="down"
        disabled={readOnly || index === count - 1}
        onClick={() => moveItem(index, index + 1)}
      >
        <ChevronDownIcon />
      </TooltipIconButton>
      <TooltipIconButton
        variant="ghost"
        title="Remove"
        data-array-action="remove"
        disabled={readOnly || !canRemove}
        onClick={() => removeItem(index)}
      >
        <Trash2Icon />
      </TooltipIconButton>
    </div>
  );
}
