import {Spinner} from '@/components/ui/spinner';
import {LOADING_LABEL} from '@/components/common/loading-status';

export function PageLoader() {
  return (
    <div className="flex min-h-64 flex-1 items-center justify-center">
      <Spinner className="size-16 text-primary" aria-label={LOADING_LABEL} />
    </div>
  );
}
