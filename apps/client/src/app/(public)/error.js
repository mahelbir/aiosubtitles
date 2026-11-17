'use client';

import {AppError} from '@/components/common/app-error';

export default function Error({retry}) {
  return <AppError retry={retry} />;
}
