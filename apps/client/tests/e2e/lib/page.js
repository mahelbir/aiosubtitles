import {escapeRegExp} from 'es-toolkit';
import {withQuery} from '@repo/shared/lib/url-query.js';
import {getDialog, getMain, getTab, getTabPanel} from './locators.js';
import {expect} from './test.js';
import {isPhoneLayout} from './viewport.js';

export function gotoWithQuery(page, url, query) {
  return page.goto(withQuery(url, query));
}

export function expectPageTitle(page, title) {
  return expect(page).toHaveTitle(new RegExp(`^${escapeRegExp(title)}( |$)`));
}

export function readCssColor(page, value) {
  return page.evaluate(color => {
    const probe = document.createElement('span');
    probe.style.color = color;
    document.body.append(probe);
    const computed = getComputedStyle(probe).color;
    probe.remove();
    return computed;
  }, value);
}

export function readTokenColor(page, token) {
  return readCssColor(page, `var(${token})`);
}

export function readContrastRatio(locator) {
  return locator.evaluate(element => {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext('2d', {willReadFrequently: true});
    const paint = color => {
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      return [...context.getImageData(0, 0, 1, 1).data.slice(0, 3)];
    };
    const layers = [];
    for (let node = element; node; node = node.parentElement) {
      layers.unshift(getComputedStyle(node).backgroundColor);
    }
    const background = ['white', ...layers].map(paint).at(-1);
    const text = paint(getComputedStyle(element).color);
    const luminance = channels => {
      const [red, green, blue] = channels.map(channel => {
        const value = channel / 255;
        return value <= 0.03928
          ? value / 12.92
          : ((value + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    };
    const [lighter, darker] = [luminance(text), luminance(background)].sort(
      (first, second) => second - first,
    );
    return (lighter + 0.05) / (darker + 0.05);
  });
}

export function clickButton(page, name) {
  return page.getByRole('button', {name, exact: true}).click();
}

async function openTabMenuDrawer(page) {
  const activeLabel = await page
    .getByRole('tabpanel')
    .filter({visible: true})
    .getAttribute('aria-label');
  await clickButton(page, activeLabel);
  const drawer = getDialog(page, activeLabel);
  await expect(drawer).toBeVisible();
  return drawer;
}

export async function openTabMenuItems(page) {
  if (!isPhoneLayout(page)) {
    return getMain(page).getByRole('tab');
  }
  const drawer = await openTabMenuDrawer(page);
  return drawer.getByRole('navigation').getByRole('button');
}

export async function openTabMenuItem(page, label) {
  if (isPhoneLayout(page)) {
    const drawer = await openTabMenuDrawer(page);
    await clickButton(drawer, label);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  } else {
    await getTab(page, label).click();
  }
  const panel = getTabPanel(page, label);
  await expect(panel).toBeVisible();
  return panel;
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
    .getByRole('button', {name: 'Continue'})
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
