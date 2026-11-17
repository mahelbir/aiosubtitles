import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {buildClientCsp} from '../../src/lib/client-csp.js';
import {fixturePath} from '../helpers/client-export.js';

describe('buildClientCsp', () => {
  it('allows every inline script of the exported configure page', () => {
    const html = readFileSync(fixturePath('configure.html'), 'utf8');
    const csp = buildClientCsp(html);
    const inlineScripts = [
      ...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g),
    ].map(match => match[1]);
    expect(inlineScripts.length).toBeGreaterThan(0);
    for (const script of inlineScripts) {
      expect(csp).toContain(
        `'sha256-${createHash('sha256').update(script).digest('base64')}'`,
      );
    }
    expect(csp).toMatch(/frame-ancestors 'none'/);
    expect(csp).not.toMatch(
      /'unsafe-inline'[^;]*script|script-src[^;]*'unsafe-inline'/,
    );
  });

  it('allows every inline style of the exported configure page by its hash', () => {
    const html = readFileSync(fixturePath('configure.html'), 'utf8');
    const csp = buildClientCsp(html);
    const inlineStyles = [
      ...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g),
    ].map(match => match[1]);
    const styleSrc = csp
      .split(';')
      .map(directive => directive.trim())
      .find(directive => directive.startsWith('style-src '));
    expect(inlineStyles.length).toBeGreaterThan(0);
    for (const style of inlineStyles) {
      expect(styleSrc).toContain(
        `'sha256-${createHash('sha256').update(style).digest('base64')}'`,
      );
    }
    expect(styleSrc).toMatch(/^style-src 'self'/);
    expect(csp).not.toContain("'unsafe-inline'");
  });
});
