import {createHash} from 'node:crypto';
import {uniq} from 'es-toolkit';

const SCRIPT_TAG = 'script';
const STYLE_TAG = 'style';
const SOURCE_ATTRIBUTE_PATTERN = /\ssrc\s*=/i;

const SELF = "'self'";
const NONE = "'none'";

export function buildClientCsp(html) {
  const directives = {
    'default-src': [NONE],
    'script-src': [SELF, ...getInlineHashes(html, SCRIPT_TAG)],
    'style-src': [SELF, ...getInlineHashes(html, STYLE_TAG)],
    'font-src': [SELF],
    'img-src': [SELF],
    'connect-src': [SELF],
    'base-uri': [NONE],
    'form-action': [NONE],
    'frame-ancestors': [NONE],
  };
  return Object.entries(directives)
    .map(([name, sources]) => `${name} ${sources.join(' ')}`)
    .join('; ');
}

function getInlineHashes(html, tag) {
  const pattern = new RegExp(
    `<${tag}\\b([^>]*)>([\\s\\S]*?)<\\/${tag}\\s*>`,
    'gi',
  );
  const hashes = [...html.matchAll(pattern)]
    .filter(([, attributes]) => !SOURCE_ATTRIBUTE_PATTERN.test(attributes))
    .map(
      ([, , content]) =>
        `'sha256-${createHash('sha256').update(content).digest('base64')}'`,
    );
  return uniq(hashes);
}
