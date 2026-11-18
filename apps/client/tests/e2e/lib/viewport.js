const MEDIUM_SCREEN_WIDTH = 768;

export const PHONE_VIEWPORT = Object.freeze({width: 375, height: 812});

export const TALL_PHONE_VIEWPORT = Object.freeze({width: 390, height: 844});

export function isPhoneLayout(page) {
  return page.viewportSize().width < MEDIUM_SCREEN_WIDTH;
}
