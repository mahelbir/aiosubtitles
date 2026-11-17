'use client';

import {useSearchParams} from 'next/navigation';

export function ConfigurePlaceholder() {
  const userConfigId = useSearchParams().get('userConfigId');

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-2 p-6">
      <h1 className="text-2xl font-semibold">AIOSubtitles</h1>
      {userConfigId && (
        <p className="text-muted-foreground">{`Configuration ${userConfigId}`}</p>
      )}
    </main>
  );
}
