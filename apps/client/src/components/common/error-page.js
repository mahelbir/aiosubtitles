import {StatusCodes} from 'http-status-codes';

export function ErrorPage({
  code,
  title = 'Error!',
  message = 'Something went wrong.',
  actions = null,
}) {
  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-6">
      <div className="w-full max-w-2xl text-center">
        <div className="flex flex-col items-center gap-4 md:flex-row md:items-stretch md:gap-6 md:text-start">
          <p className="text-6xl font-semibold text-primary md:pe-6 md:text-7xl">
            {code || StatusCodes.INTERNAL_SERVER_ERROR}
          </p>
          <div className="flex flex-col justify-center gap-1 md:border-s md:ps-6">
            <h1 className="text-2xl font-semibold">{title}</h1>
            {message && <p className="text-muted-foreground">{message}</p>}
          </div>
        </div>
        {actions && (
          <div className="mt-8 flex flex-wrap justify-center gap-2">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
