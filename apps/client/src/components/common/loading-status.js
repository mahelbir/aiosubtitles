import {Spinner} from '@/components/ui/spinner';

export const LOADING_LABEL = 'Yükleniyor';

export function LoadingStatus() {
  return (
    <span className="sr-only">
      <Spinner aria-label={LOADING_LABEL} />
    </span>
  );
}

export function BusyRegion({className, children}) {
  return (
    <>
      <LoadingStatus />
      <div className={className} aria-busy="true">
        {children}
      </div>
    </>
  );
}
