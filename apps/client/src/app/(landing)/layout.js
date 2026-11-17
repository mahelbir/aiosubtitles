import '@/styles/globals.css';
import {env} from '@/config/env.js';
import {THEME_COLORS} from '@/config/theme';
import {fontVariables} from '../fonts';
import {LandingProvider} from './provider';

export const viewport = {
  themeColor: THEME_COLORS,
};

export default function LandingLayout({children}) {
  return (
    <html
      lang={env.LOCALE}
      data-scroll-behavior="smooth"
      className={fontVariables}
      suppressHydrationWarning
    >
      <body className="font-sans antialiased">
        <LandingProvider>{children}</LandingProvider>
      </body>
    </html>
  );
}
