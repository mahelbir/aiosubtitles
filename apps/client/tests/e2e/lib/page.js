import {escapeRegExp} from 'es-toolkit';
import {withQuery} from '@repo/shared/lib/url-query.js';
import {expect} from './test.js';

export const PHONE_VIEWPORT = Object.freeze({width: 375, height: 812});

export function gotoWithQuery(page, url, query) {
  return page.goto(withQuery(url, query));
}

export function expectPageTitle(page, title) {
  return expect(page).toHaveTitle(new RegExp(`^${escapeRegExp(title)}( |$)`));
}

export function clickButton(page, name) {
  return page.getByRole('button', {name, exact: true}).click();
}

export function recordAnimations(page) {
  return page.evaluate(() => {
    window.__animatedTexts = [];
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (...args) {
      window.__animatedTexts.push(this.textContent);
      return animate.apply(this, args);
    };
    const play = Animation.prototype.play;
    Animation.prototype.play = function (...args) {
      if (this.effect?.getKeyframes().length > 0) {
        window.__animatedTexts.push(this.effect.target.textContent);
      }
      return play.apply(this, args);
    };
  });
}

export function expectAnimated(page, text) {
  return expect.poll(() =>
    page.evaluate(
      prefix =>
        window.__animatedTexts.some(content => content.startsWith(prefix)),
      text,
    ),
  );
}

export function settleAnimatedPositions(page) {
  return page.waitForTimeout(600);
}

export async function trackBoxDuring(locator, action) {
  await locator.evaluate(node => {
    window.__boxes = [];
    const track = () => {
      if (node.isConnected) {
        const {top, height} = node.getBoundingClientRect();
        window.__boxes.push(`${Math.round(top)}/${Math.round(height)}`);
      }
      window.__boxFrame = requestAnimationFrame(track);
    };
    track();
  });
  await action();
  await waitForAnimations(locator.page());
  return locator.page().evaluate(() => {
    cancelAnimationFrame(window.__boxFrame);
    return [...new Set(window.__boxes)];
  });
}

export async function waitForAnimations(page) {
  await page.evaluate(() =>
    Promise.allSettled(
      document.getAnimations().map(animation => animation.finished),
    ),
  );
}

export function settleAnimations(scope) {
  return scope.evaluate(element =>
    Promise.allSettled(
      element
        .getAnimations({subtree: true})
        .filter(
          animation =>
            animation.effect.getComputedTiming().endTime !== Infinity,
        )
        .map(animation => animation.finished),
    ),
  );
}

export function recordBoxes(page, selector) {
  return page.evaluate(target => {
    const boxes = [];
    window.__recordedBoxes = {...window.__recordedBoxes, [target]: boxes};
    const sample = () => {
      const element = document.querySelector(target);
      if (element) {
        const box = element.getBoundingClientRect();
        boxes.push({
          top: box.top,
          height: box.height,
          left: box.left,
          width: box.width,
          opacity: Number(getComputedStyle(element).opacity),
        });
      }
      window.requestAnimationFrame(sample);
    };
    window.requestAnimationFrame(sample);
  }, selector);
}

export function readBoxes(page, selector) {
  return page.evaluate(target => window.__recordedBoxes[target], selector);
}

export function expectHeightsToGlide(boxes) {
  const heights = boxes.map(box => Math.round(box.height));
  const low = Math.min(...heights);
  const high = Math.max(...heights);
  const inBetween = new Set(
    heights.filter(height => height > low && height < high),
  );
  expect(inBetween.size).toBeGreaterThanOrEqual(3);
}

export async function retype(field, text) {
  await field.press('ControlOrMeta+A');
  await field.pressSequentially(text);
}

export function confirmDangerous(page, title) {
  return page
    .getByRole('alertdialog', {name: title})
    .getByRole('button', {name: 'Devam'})
    .click();
}

export function expectSearchParams(page) {
  return expect.poll(() =>
    Object.fromEntries(new URL(page.url()).searchParams),
  );
}

export async function expectUnloadAsked(page) {
  const dialog = page.waitForEvent('dialog');

  await page.close({runBeforeUnload: true});

  expect((await dialog).type()).toBe('beforeunload');
  await (await dialog).dismiss();
  expect(page.isClosed()).toBe(false);
}

export async function expectUnloadUnasked(page) {
  const dialogs = [];
  page.on('dialog', dialog => {
    dialogs.push(dialog.type());
    return dialog.accept();
  });
  const closed = page.waitForEvent('close');

  await page.close({runBeforeUnload: true});

  await closed;
  expect(dialogs).toEqual([]);
}
