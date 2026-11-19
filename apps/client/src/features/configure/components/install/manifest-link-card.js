'use client';

import {CopyIcon, DownloadIcon} from 'lucide-react';
import {toast} from 'react-toastify/unstyled';
import {ExternalLinkButton, LinkButton} from '@/components/common/link-button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group';
import {Tooltip, TooltipContent, TooltipTrigger} from '@/components/ui/tooltip';

const ADDON_URL_LABEL = 'Addon URL';
const COPY_LINK_LABEL = 'Copy link';
const STREMIO_WEB_ADDONS_URL = 'https://web.stremio.com/#/addons';

function toAppUrl(manifestUrl, scheme) {
  const {host, pathname} = new URL(manifestUrl);
  return `${scheme}://${host}${pathname}`;
}

function toStremioWebUrl(manifestUrl) {
  return `${STREMIO_WEB_ADDONS_URL}?${new URLSearchParams({addon: manifestUrl})}`;
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
        <CardTitle>{ADDON_URL_LABEL}</CardTitle>
      </CardHeader>
      <CardContent>
        <InputGroup>
          <InputGroupInput
            readOnly
            value={manifestUrl}
            aria-label={ADDON_URL_LABEL}
            className="font-mono"
            onFocus={event => event.target.select()}
          />
          <InputGroupAddon align="inline-end">
            <Tooltip>
              <TooltipTrigger
                render={
                  <InputGroupButton
                    size="icon-xs"
                    aria-label={COPY_LINK_LABEL}
                    onClick={copyManifestUrl}
                  />
                }
              >
                <CopyIcon />
              </TooltipTrigger>
              <TooltipContent>{COPY_LINK_LABEL}</TooltipContent>
            </Tooltip>
          </InputGroupAddon>
        </InputGroup>
      </CardContent>
      <CardFooter className="flex-wrap gap-2">
        <LinkButton variant="outline" href={toAppUrl(manifestUrl, 'stremio')}>
          <DownloadIcon data-icon="inline-start" />
          Install in Stremio app
        </LinkButton>
        <ExternalLinkButton
          variant="outline"
          size="default"
          href={toStremioWebUrl(manifestUrl)}
        >
          Install in Stremio Web
        </ExternalLinkButton>
        <LinkButton variant="outline" href={toAppUrl(manifestUrl, 'nuvio')}>
          <DownloadIcon data-icon="inline-start" />
          Install in Nuvio
        </LinkButton>
      </CardFooter>
    </Card>
  );
}
