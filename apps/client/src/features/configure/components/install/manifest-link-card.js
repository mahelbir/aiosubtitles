'use client';

import {CopyIcon, DownloadIcon} from 'lucide-react';
import {toast} from 'react-toastify/unstyled';
import {LinkButton} from '@/components/common/link-button';
import {Button} from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

function toStremioUrl(manifestUrl) {
  const {host, pathname} = new URL(manifestUrl);
  return `stremio://${host}${pathname}`;
}

export function ManifestLinkCard({manifestUrl}) {
  const copyManifestUrl = () =>
    navigator.clipboard.writeText(manifestUrl).then(
      () => toast.success('Link copied.'),
      () => toast.error('The link could not be copied.'),
    );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Install link</CardTitle>
        <CardDescription>
          Install opens Stremio. Copy the link to paste it in Stremio yourself.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <code className="block rounded-lg border bg-muted px-3 py-2 font-mono text-sm break-all">
          {manifestUrl}
        </code>
      </CardContent>
      <CardFooter className="flex-wrap gap-2">
        <LinkButton href={toStremioUrl(manifestUrl)}>
          <DownloadIcon data-icon="inline-start" />
          Install in Stremio
        </LinkButton>
        <Button variant="outline" onClick={copyManifestUrl}>
          <CopyIcon data-icon="inline-start" />
          Copy
        </Button>
      </CardFooter>
    </Card>
  );
}
