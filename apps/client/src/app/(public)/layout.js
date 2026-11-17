import {APP_METADATA, APP_VIEWPORT, AppDocument} from '../app-document';
import {PublicProvider} from './provider';

export const metadata = APP_METADATA;

export const viewport = APP_VIEWPORT;

export default function PublicLayout({children}) {
  return (
    <AppDocument>
      <PublicProvider>{children}</PublicProvider>
    </AppDocument>
  );
}
