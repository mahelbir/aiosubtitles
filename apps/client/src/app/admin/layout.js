import {APP_METADATA, APP_VIEWPORT, AppDocument} from '../app-document';
import {AdminProvider} from './provider';

export const metadata = APP_METADATA;

export const viewport = APP_VIEWPORT;

export default function AdminLayout({children}) {
  return (
    <AppDocument>
      <AdminProvider>{children}</AdminProvider>
    </AppDocument>
  );
}
