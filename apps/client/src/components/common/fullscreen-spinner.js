import {Spinner} from '@/components/ui/spinner';
import {LOADING_LABEL} from '@/components/common/loading-status';

export function FullscreenSpinner() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80">
      <Spinner className="size-16 text-primary" aria-label={LOADING_LABEL} />
    </div>
  );
}
