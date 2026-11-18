'use client';

import {useTheme} from 'next-themes';
import {ErrorAlert} from '@/components/common/status-alerts';
import {Badge} from '@/components/ui/badge';
import {Button} from '@/components/ui/button';
import {Card, CardContent} from '@/components/ui/card';
import {Field, FieldError, FieldLabel} from '@/components/ui/field';
import {Input} from '@/components/ui/input';
import {useIsClient} from '@/hooks/use-is-client';
import {FixtureSection} from './fixture-section';
import {FixtureState} from './fixture-state';

const SURFACES = [
  {name: 'page', title: 'On the page', Surface: PageSurface},
  {name: 'card', title: 'In a card', Surface: CardSurface},
];

function PageSurface({children}) {
  return <div className="flex flex-col gap-4">{children}</div>;
}

function CardSurface({children}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-4">{children}</CardContent>
    </Card>
  );
}

function DestructiveSamples({name}) {
  const inputId = `${name}-destructive-input`;
  return (
    <>
      <Field data-invalid>
        <FieldLabel htmlFor={inputId}>Name</FieldLabel>
        <Input id={inputId} aria-invalid />
        <FieldError>Name is required.</FieldError>
      </Field>
      <ErrorAlert title="Download failed">
        The source did not answer.
      </ErrorAlert>
      <div className="flex items-center gap-2">
        <Button variant="destructive">Delete</Button>
        <Badge variant="destructive">Invalid</Badge>
      </div>
    </>
  );
}

export function ThemeFixture() {
  const isClient = useIsClient();
  const {forcedTheme, themes} = useTheme();

  return (
    <>
      {SURFACES.map(({name, title, Surface}) => (
        <FixtureSection key={name} title={title}>
          <Surface>
            <DestructiveSamples name={name} />
          </Surface>
        </FixtureSection>
      ))}
      <FixtureState value={isClient ? {forcedTheme, themes} : null} />
    </>
  );
}
