'use client';

import {useState} from 'react';
import {ChevronRightIcon, SearchIcon} from 'lucide-react';
import {cn} from 'cn';
import {SEARCHABLE_THRESHOLD} from '@/config/search';
import {useOptionFilter} from '@/hooks/use-option-filter';
import {useWholeOptionList} from '@/hooks/use-option-source';
import {getInputTypeProps} from '@/lib/form';
import {useFieldControl} from '@/lib/form-context';
import {toOptionSections} from '@/lib/option-section';
import {LOADING_LABEL} from '@/components/common/loading-status';
import {FieldMessage} from '@/components/form/field-message';
import {Checkbox} from '@/components/ui/checkbox';
import {CheckboxGroup} from '@/components/ui/checkbox-group';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {Field, FieldGroup, FieldLegend, FieldSet} from '@/components/ui/field';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group';
import {Label} from '@/components/ui/label';
import {Spinner} from '@/components/ui/spinner';

function toParentValues(items, selected) {
  const isReachable = items.some(option => !option.disabled)
    ? option => !option.disabled || selected.includes(option.value)
    : () => true;
  return items.filter(isReachable).map(option => option.value);
}

/**
 * @param {{
 *   label?: React.ReactNode,
 *   source: import('@/lib/option-source').OptionSource,
 *   help?: React.ReactNode,
 *   className?: string,
 *   isSearchable?: boolean,
 *   disabled?: boolean,
 *   readOnly?: boolean,
 *   onBlur?: function(React.FocusEvent): void,
 *   "aria-describedby"?: string,
 * }} props
 * @returns {React.JSX.Element}
 */
export function CheckboxGroupInput({
  label,
  source,
  help,
  className,
  isSearchable,
  disabled,
  readOnly,
  onBlur,
  'aria-describedby': ariaDescribedBy,
}) {
  const {field, controlId, error, messageId, describedBy, handleBlur} =
    useFieldControl({
      help,
      props: {disabled, onBlur, 'aria-describedby': ariaDescribedBy},
    });
  const selected = field.state.value ?? [];
  const [query, setQuery] = useState('');

  const {listed, isPending, emptyMessage} = useWholeOptionList(source);
  const {contains} = useOptionFilter();
  const hasSearch = isSearchable ?? listed.length > SEARCHABLE_THRESHOLD;

  const sections = toOptionSections(listed);
  const [openKeys, setOpenKeys] = useState(null);
  if (openKeys === null && sections.length > 0) {
    setOpenKeys(
      sections
        .filter(section =>
          section.items.some(option => selected.includes(option.value)),
        )
        .map(section => section.key),
    );
  }

  const visible = query
    ? sections
        .map(section => ({
          ...section,
          items: section.items.filter(option => contains(option, query)),
        }))
        .filter(section => section.items.length > 0)
    : sections;

  const setSelected = next => field.handleChange(next);

  const setSectionSelected = (items, next) => {
    const values = items.map(option => option.value);
    const locked = items
      .filter(option => option.disabled)
      .map(option => option.value);
    setSelected([
      ...selected.filter(
        value => !values.includes(value) || locked.includes(value),
      ),
      ...next.filter(value => !locked.includes(value)),
    ]);
  };

  const renderOption = option => {
    const id = `${controlId}-${option.value}`;
    return (
      <Field key={option.value} orientation="horizontal">
        <Checkbox
          id={id}
          value={option.value}
          disabled={option.disabled}
          readOnly={readOnly}
          onBlur={handleBlur}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
        />
        <Label htmlFor={id}>{option.label}</Label>
      </Field>
    );
  };

  const renderSection = section => {
    const values = section.items.map(option => option.value);
    const sectionSelected = selected.filter(value => values.includes(value));

    return (
      <CheckboxGroup
        key={section.key}
        aria-label={section.key}
        value={sectionSelected}
        onValueChange={next => setSectionSelected(section.items, next)}
        allValues={toParentValues(section.items, selected)}
        disabled={disabled}
      >
        <Collapsible
          open={Boolean(query) || (openKeys ?? []).includes(section.key)}
          onOpenChange={open =>
            setOpenKeys(keys =>
              open
                ? [...keys, section.key]
                : keys.filter(key => key !== section.key),
            )
          }
        >
          <div className="flex items-center gap-2">
            <Checkbox
              parent
              aria-label={`Select all ${section.key}`}
              disabled={section.items.every(option => option.disabled)}
              readOnly={readOnly}
            />
            <CollapsibleTrigger className="group/section flex flex-1 items-center gap-2 text-sm font-medium">
              <ChevronRightIcon className="size-4 text-muted-foreground transition-transform duration-200 group-data-panel-open/section:rotate-90" />
              {section.key}
              <span className="ms-auto text-xs font-normal text-muted-foreground">
                {sectionSelected.length}/{section.items.length}
              </span>
            </CollapsibleTrigger>
          </div>
          <CollapsibleContent>
            <FieldGroup className="ps-6 pt-2">
              {section.items.map(renderOption)}
            </FieldGroup>
          </CollapsibleContent>
        </Collapsible>
      </CheckboxGroup>
    );
  };

  const isSectioned = sections.some(section => section.key);

  return (
    <Field
      className={className}
      data-invalid={Boolean(error)}
      data-disabled={disabled}
    >
      <FieldSet>
        {label && <FieldLegend variant="label">{label}</FieldLegend>}
        {hasSearch && (
          <InputGroup>
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              type="search"
              {...getInputTypeProps('search')}
              aria-label="Search"
              value={query}
              placeholder="Search…"
              onChange={event => setQuery(event.target.value)}
            />
          </InputGroup>
        )}
        <FieldGroup className={cn(isSectioned && 'gap-3')}>
          {isPending && <Spinner aria-label={LOADING_LABEL} />}
          {!isPending && visible.length === 0 && (
            <p className="text-sm text-muted-foreground">{emptyMessage}</p>
          )}
          {visible.map(section =>
            section.key ? (
              renderSection(section)
            ) : (
              <CheckboxGroup
                key={section.key}
                render={<FieldGroup />}
                value={selected}
                onValueChange={setSelected}
                disabled={disabled}
              >
                {section.items.map(renderOption)}
              </CheckboxGroup>
            ),
          )}
        </FieldGroup>
      </FieldSet>
      <FieldMessage id={messageId} error={error} help={help} />
    </Field>
  );
}
