import {StatusCodes} from 'http-status-codes';
import {LinkButton} from '@/components/common/link-button';
import {ErrorPage} from '@/components/common/error-page';
import {THEME_COLORS} from '@/config/theme';
import LandingLayout from './(landing)/layout';

export const metadata = {
  title: 'Sayfa bulunamadı',
};

export const viewport = {
  themeColor: THEME_COLORS,
};

export default function GlobalNotFound() {
  return (
    <LandingLayout>
      <ErrorPage
        code={StatusCodes.NOT_FOUND}
        title="Üzgünüz!"
        message="Aradığınız sayfa bulunamadı."
        actions={
          <LinkButton variant="secondary" href="/">
            Ana sayfaya dön
          </LinkButton>
        }
      />
    </LandingLayout>
  );
}
