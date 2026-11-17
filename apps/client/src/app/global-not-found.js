import {StatusCodes} from 'http-status-codes';
import {LinkButton} from '@/components/common/link-button';
import {ErrorPage} from '@/components/common/error-page';
import {THEME_COLORS} from '@/config/theme';
import {AppDocument} from './app-document';

export const metadata = {
  title: 'Page not found',
};

export const viewport = {
  themeColor: THEME_COLORS,
};

export default function GlobalNotFound() {
  return (
    <AppDocument>
      <ErrorPage
        code={StatusCodes.NOT_FOUND}
        title="Sorry!"
        message="The page you are looking for was not found."
        actions={
          <LinkButton variant="secondary" href="/configure">
            Go to the home page
          </LinkButton>
        }
      />
    </AppDocument>
  );
}
