import {StatusCodes} from 'http-status-codes';
import {ErrorPage} from '@/components/common/error-page';
import {LinkButton} from '@/components/common/link-button';

export function EntityNotFound({
  title = 'Bulunamadı!',
  message = 'Aradığınız kayıt bulunamadı.',
  back = '/',
}) {
  return (
    <ErrorPage
      code={StatusCodes.NOT_FOUND}
      title={title}
      message={message}
      actions={
        <LinkButton variant="secondary" href={back}>
          Geri dön
        </LinkButton>
      }
    />
  );
}
