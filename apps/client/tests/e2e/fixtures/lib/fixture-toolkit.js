import {compact, isNil, omitBy} from 'es-toolkit';
import {truncate} from 'es-toolkit/compat';

const DIGEST_STATE_ATTRIBUTES = [
  'aria-checked',
  'aria-expanded',
  'aria-current',
  'aria-pressed',
  'aria-disabled',
  'data-checked',
  'data-indeterminate',
  'href',
];
const DIGEST_STYLE_PROPERTIES = [
  'display',
  'flexDirection',
  'gap',
  'padding',
  'fontSize',
  'fontWeight',
  'color',
  'backgroundColor',
  'borderRadius',
  'border',
  'justifyContent',
  'alignItems',
  'textAlign',
  'position',
  'transitionDuration',
];

export const fixtureToolkit = {
  state() {
    const element = document.querySelector('[data-testid="fixture-state"]');
    return element ? JSON.parse(element.textContent) : null;
  },

  focused() {
    const element = document.activeElement ?? document.body;
    const tag = element.tagName.toLowerCase();
    if (element === document.body) {
      return tag;
    }
    const role = element.getAttribute('role');
    const name = getLabel(element) ?? getText(element);
    return compact([tag, role && `[role=${role}]`, name && `"${name}"`]).join(
      ' ',
    );
  },

  digest(selector) {
    const root = document.querySelector(selector);
    if (!root) {
      return null;
    }
    const origin = root.getBoundingClientRect();
    const elements = [
      root,
      ...root.querySelectorAll(
        'button, a, input, select, textarea, nav, ul, li, fieldset, [role], [data-slot]',
      ),
    ];
    return {
      size: {w: Math.round(origin.width), h: Math.round(origin.height)},
      elements: compact(
        elements.map(element => describeElement(element, origin)),
      ),
    };
  },
};

function describeElement(element, origin) {
  const rect = element.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    return null;
  }
  const style = getComputedStyle(element);
  return {
    tag: element.tagName.toLowerCase(),
    slot: element.getAttribute('data-slot'),
    role: element.getAttribute('role'),
    label: getLabel(element),
    text: getText(element),
    state: getState(element),
    box: {
      x: Math.round(rect.x - origin.x),
      y: Math.round(rect.y - origin.y),
      w: Math.round(rect.width),
      h: Math.round(rect.height),
    },
    style: Object.fromEntries(
      DIGEST_STYLE_PROPERTIES.map(property => [property, style[property]]),
    ),
  };
}

function getState(element) {
  const attributes = Object.fromEntries(
    DIGEST_STATE_ATTRIBUTES.map(name => [name, element.getAttribute(name)]),
  );
  return omitBy({...attributes, disabled: element.disabled || null}, isNil);
}

function getLabel(element) {
  const label = [
    element.getAttribute('aria-label'),
    getLabelledByText(element),
    element.labels?.[0]?.textContent,
    element.getAttribute('placeholder'),
  ].find(Boolean);
  return label ? collapseWhitespace(label) : null;
}

function getLabelledByText(element) {
  return element
    .getAttribute('aria-labelledby')
    ?.split(' ')
    .map(id => document.getElementById(id)?.textContent ?? '')
    .join(' ');
}

function getText(element) {
  const text = collapseWhitespace(element.textContent);
  return text ? truncate(text, {length: 80}) : null;
}

function collapseWhitespace(text) {
  return text.replace(/\s+/g, ' ').trim();
}
