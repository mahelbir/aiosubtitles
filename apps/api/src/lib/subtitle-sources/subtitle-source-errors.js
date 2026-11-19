import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {CatalogService} from '../video-catalog/catalog-service.js';

export class SubtitleSourceError extends Error {
  constructor({subtitleSource, message, cause}) {
    const serviceLabel =
      SubtitleSource.label(subtitleSource) ??
      CatalogService.label(subtitleSource) ??
      subtitleSource;
    super(`${serviceLabel} ${message}`, {cause});
    this.name = new.target.name;
    this.serviceName = subtitleSource;
    this.subtitleSource = SubtitleSource.has(subtitleSource)
      ? subtitleSource
      : null;
  }
}

export class SourceRateLimitError extends SubtitleSourceError {
  constructor({
    subtitleSource,
    retryAfterMs,
    credentialId = null,
    isKeylessCall = false,
  }) {
    super({subtitleSource, message: 'rate limit reached.'});
    this.retryAfterMs = retryAfterMs;
    this.credentialId = credentialId;
    this.isKeylessCall = isKeylessCall;
  }
}

export class SourceCredentialError extends SubtitleSourceError {
  constructor({subtitleSource, credentialId}) {
    super({subtitleSource, message: 'rejected the credential.'});
    this.credentialId = credentialId;
  }
}

export class SourceCallRefusedError extends SubtitleSourceError {
  constructor({subtitleSource}) {
    super({subtitleSource, message: 'has no room for a server call.'});
  }
}

export class SourceUnavailableError extends SubtitleSourceError {
  constructor({subtitleSource, cause}) {
    super({subtitleSource, message: 'is unavailable.', cause});
  }
}
