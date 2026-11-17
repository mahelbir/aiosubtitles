import {SEARCH_MIN_LENGTH} from '@repo/shared/constants/pagination.js';
import {getIntlFormatter} from '@/lib/intl';

export function toSearchTerm(text) {
  const term = text.trim();
  return term.length >= SEARCH_MIN_LENGTH ? term : '';
}

export function isSameText(first, second) {
  return (
    getIntlFormatter(Intl.Collator, {sensitivity: 'accent'}).compare(
      first,
      second,
    ) === 0
  );
}
