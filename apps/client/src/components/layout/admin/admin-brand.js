import Link from 'next/link';
import {cn} from 'cn';
import {APP_NAME} from '@/config/app';

export function AdminHomeLink(props) {
  return <Link href="/admin" {...props} />;
}

export function AdminBrandLink({className, ...props}) {
  return (
    <AdminHomeLink className={cn('flex min-w-0', className)} {...props}>
      <AdminBrand />
    </AdminHomeLink>
  );
}

export function AdminBrand({className}) {
  return (
    <span className={cn('truncate text-lg font-semibold', className)}>
      {APP_NAME}
    </span>
  );
}
