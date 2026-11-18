import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';

export class SubtitleSourceError extends Error {
  constructor({subtitleSource, message, cause}) {
    super(`${SubtitleSource.label(subtitleSource)} ${message}`, {cause});
    this.name = new.target.name;
    this.subtitleSource = subtitleSource;
  }
}

export class SourceRateLimitError extends SubtitleSourceError {
  constructor({subtitleSource, retryAfterMs, credentialId = null}) {
    super({subtitleSource, message: 'rate limit reached.'});
    this.retryAfterMs = retryAfterMs;
    this.credentialId = credentialId;
  }
}

export class SourceCredentialError extends SubtitleSourceError {
  constructor({subtitleSource, credentialId}) {
    super({subtitleSource, message: 'rejected the credential.'});
    this.credentialId = credentialId;
  }
}

export class SourceUnavailableError extends SubtitleSourceError {
  constructor({subtitleSource, cause}) {
    super({subtitleSource, message: 'is unavailable.', cause});
  }
}
