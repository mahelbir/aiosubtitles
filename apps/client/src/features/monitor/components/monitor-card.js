'use client';

import {useMemo, useState} from 'react';
import {Trash2Icon} from 'lucide-react';
import {cn} from 'cn';
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {CodeViewer} from '@/components/common/code-viewer';
import {IconButton} from '@/components/common/icon-button.js';
import {useAutoAnimate} from '@/hooks/use-auto-animate';
import {LEVEL_TEXT_CLASS} from '../lib/levels';

export function MonitorCard({card, onClear}) {
  const [detailRow, setDetailRow] = useState(null);
  const rowsRef = useAutoAnimate();

  const openDetail = row => {
    setDetailRow(row);
  };

  const detailJson = useMemo(
    () => (detailRow ? JSON.stringify(detailRow.data, null, 2) : null),
    [detailRow],
  );

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle casing="upper">{card.title}</CardTitle>
          <CardAction>
            <IconButton variant="destructive" onClick={onClear} title="Temizle">
              <Trash2Icon />
            </IconButton>
          </CardAction>
        </CardHeader>
        <CardContent
          ref={rowsRef}
          className="max-h-144 scroll-fade overflow-y-auto"
        >
          {card.rows.map(row => {
            const isClickable = row.data != null;
            const Tag = isClickable ? 'button' : 'div';
            return (
              <Tag
                key={row.key}
                type={isClickable ? 'button' : undefined}
                aria-haspopup={isClickable ? 'dialog' : undefined}
                onClick={isClickable ? () => openDetail(row) : undefined}
                className={cn(
                  'mb-1 font-mono content-visibility-auto',
                  LEVEL_TEXT_CLASS[row.level] ?? 'text-foreground',
                  isClickable &&
                    'block w-full cursor-pointer rounded-sm text-start hover:underline focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none',
                )}
              >
                [{row.time}] {row.message}
              </Tag>
            );
          })}
        </CardContent>
      </Card>
      <Dialog
        open={Boolean(detailRow)}
        onOpenChange={open => {
          if (!open) {
            setDetailRow(null);
          }
        }}
      >
        <DialogContent position="top" size="lg">
          <DialogHeader>
            <DialogTitle>{card.title}</DialogTitle>
          </DialogHeader>
          {detailRow && (
            <>
              <p className="text-sm text-muted-foreground">
                [{detailRow.time}] {detailRow.message}
              </p>
              <CodeViewer
                value={detailJson}
                language="json"
                title={card.title}
              />
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
