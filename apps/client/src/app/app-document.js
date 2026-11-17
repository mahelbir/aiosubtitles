import '@/styles/globals.css';
import {preconnect} from 'react-dom';
import {API_ORIGIN, APP_NAME, TITLE_SUFFIX} from '@/config/app';
import {env} from '@/config/env.js';
import {THEME_COLORS} from '@/config/theme';
import {fontVariables} from './fonts';

export const APP_METADATA = {
  title: {
    default: APP_NAME,
    template: `%s${TITLE_SUFFIX}`,
  },
  robots: {
    index: false,
    follow: false,
  },
};

export const APP_VIEWPORT = {
  themeColor: THEME_COLORS,
};

export function AppDocument({children}) {
  preconnect(API_ORIGIN);

  return (
    <html
      lang={env.LOCALE}
      data-scroll-behavior="smooth"
      className={fontVariables}
      suppressHydrationWarning
    >
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
