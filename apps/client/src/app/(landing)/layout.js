import '@/styles/globals.css';
import {cn} from 'cn';
import {env} from '@/config/env.js';
import {APP_THEME, THEME_COLORS} from '@/config/theme';
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
      className={cn(APP_THEME, fontVariables)}
      suppressHydrationWarning
    >
      <body className="font-sans antialiased">
        <LandingProvider>{children}</LandingProvider>
      </body>
    </html>
  );
}
