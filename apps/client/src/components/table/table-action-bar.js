'use client';

import {XIcon} from 'lucide-react';
import {ButtonGroup, ButtonGroupText} from '@/components/ui/button-group';
import {Toolbar, ToolbarButton} from '@/components/ui/toolbar';
import {useAutoAnimate} from '@/hooks/use-auto-animate';
import {useTableContext} from './table-provider';

const BAR_KEYFRAMES = {
  add: [
    {opacity: 0, transform: 'translateY(0.5rem)'},
    {opacity: 1, transform: 'none'},
  ],
  remove: [{opacity: 1}, {opacity: 0}],
  remain: [],
};

function barMotion(element, action) {
  return [
    new KeyframeEffect(element, BAR_KEYFRAMES[action], {
      duration: 200,
      easing: 'ease-out',
    }),
    {styleReset: false},
  ];
}

export function TableActionBar({children}) {
  const {table, readRowId} = useTableContext();
  const barRef = useAutoAnimate(barMotion);
  const rows = table.getSelectedRowModel().rows;

  const clear = () => table.resetRowSelection();
  const renderContent = () =>
    typeof children === 'function'
      ? children({rows, ids: rows.map(row => readRowId(row.original)), clear})
      : children;

  return (
    <div
      ref={barRef}
      className="pointer-events-none fixed inset-x-0 bottom-safe z-50 flex justify-center px-4"
    >
      {rows.length > 0 && (
        <div className="max-w-full">
          <Toolbar
            aria-label="Toplu işlemler"
            className="pointer-events-auto flex-wrap justify-center rounded-lg border bg-background p-2 shadow-lg"
          >
            <ButtonGroup className="shrink-0">
              <ButtonGroupText role="status" className="whitespace-nowrap">
                <span className="tabular-nums">{rows.length}</span> seçildi
              </ButtonGroupText>
              <ToolbarButton
                variant="outline"
                size="icon-sm"
                aria-label="Seçimi temizle"
                onClick={clear}
              >
                <XIcon />
              </ToolbarButton>
            </ButtonGroup>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {renderContent()}
            </div>
          </Toolbar>
        </div>
      )}
    </div>
  );
}
