'use client';

import Link from 'next/link';
import {FIXTURES} from '../registry';

export function FixtureIndex() {
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Fixtures</h1>
      <ul className="flex flex-col gap-2">
        {FIXTURES.map(fixture => (
          <li key={fixture.slug} className="flex flex-col gap-1">
            <FixtureLink href={`/admin/fixtures/${fixture.slug}`}>
              {fixture.title}
            </FixtureLink>
            {fixture.variants.length > 0 && (
              <ul
                aria-label={`${fixture.title} varyantları`}
                className="flex flex-wrap gap-x-3 ps-4 font-mono text-sm"
              >
                {fixture.variants.map(variant => (
                  <li key={variant}>
                    <FixtureLink
                      href={`/admin/fixtures/${fixture.slug}${variant}`}
                    >
                      {variant}
                    </FixtureLink>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function FixtureLink({href, children}) {
  return (
    <Link
      href={href}
      className="text-primary underline-offset-4 hover:underline"
    >
      {children}
    </Link>
  );
}
