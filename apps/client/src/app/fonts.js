import {Geist, JetBrains_Mono} from 'next/font/google';
import {cn} from 'cn';

const geistSans = Geist({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-geist-sans',
});

const jetBrainsMono = JetBrains_Mono({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-jetbrains-mono',
});

export const fontVariables = cn(geistSans.variable, jetBrainsMono.variable);
