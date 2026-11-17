'use client';

import {useComboboxFilter} from '@/components/ui/combobox';
import {env} from '@/config/env';

export function useOptionFilter() {
  return useComboboxFilter({locale: env.LOCALE, sensitivity: 'accent'});
}
