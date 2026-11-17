import {describe, expect, it} from 'vitest';
import {securityFromHooks} from '../../src/lib/openapi.js';

const bearerHook = () => {};
bearerHook.openApiSecurity = [{bearerAuth: []}];

const keyHook = () => {};
keyHook.openApiSecurity = [{securityKey: []}];

const plainHook = () => {};

describe('securityFromHooks', () => {
  it('reports nothing for hooks that carry no requirement', () => {
    expect(securityFromHooks([plainHook])).toEqual([]);
    expect(securityFromHooks([])).toEqual([]);
  });

  it('lifts a single hook requirement', () => {
    expect(securityFromHooks([bearerHook])).toEqual([{bearerAuth: []}]);
  });

  it('merges several guards into one requirement, so all of them must hold', () => {
    expect(securityFromHooks([bearerHook, keyHook])).toEqual([
      {bearerAuth: [], securityKey: []},
    ]);
  });

  it('ignores unmarked hooks sitting beside marked ones', () => {
    expect(securityFromHooks([plainHook, bearerHook])).toEqual([
      {bearerAuth: []},
    ]);
  });
});
