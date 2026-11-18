import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {
  DOWNLOAD_ACCEPTED_STATUSES,
  OPENSUBTITLES_API_URL,
  opensubtitlesMapping,
} from '../../../src/lib/subtitle-sources/opensubtitles/opensubtitles-mapping.js';
import {requestSubtitleSource} from '../../../src/lib/subtitle-sources/subtitle-source-request.js';

export async function downloadWithApiKeyOnly({fileId, apiKey}) {
  const linkResponse = await requestSubtitleSource({
    subtitleSource: SubtitleSource.OPENSUBTITLES,
    url: `${OPENSUBTITLES_API_URL}/download`,
    method: 'POST',
    headers: {'Api-Key': apiKey},
    body: {file_id: Number(fileId)},
    responseType: 'json',
    acceptedStatuses: DOWNLOAD_ACCEPTED_STATUSES,
    credentialId: null,
  });
  const downloadLink = opensubtitlesMapping.toDownloadLink(linkResponse, {
    credentialId: null,
  });
  return opensubtitlesMapping.toDownload(
    await requestSubtitleSource(
      opensubtitlesMapping.buildFileRequest(downloadLink),
    ),
    downloadLink,
  );
}
