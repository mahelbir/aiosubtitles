import {formatNumber} from '@/lib/intl';

export function getSelectionCap(value, max) {
  const isFull = max !== undefined && value.length >= max;
  const chosenKeys = new Set(isFull ? value.map(String) : []);
  return {
    isFull,
    message: isFull ? `En fazla ${formatNumber(max)} seçilebilir.` : '',
    isLocked: key => isFull && !chosenKeys.has(key),
  };
}
