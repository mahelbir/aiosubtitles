'use client';

import {Maximize2Icon} from 'lucide-react';
import {IconButton} from '@/components/common/icon-button';
import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockContent,
  CodeBlockCopyButton,
  CodeBlockLine,
} from '@/components/ui/code-block';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {useHighlightedCode} from '@/components/ui/hooks/use-highlighted-code';

function CodeViewerBlock({value, language, className, children}) {
  const lines = useHighlightedCode(value, language);

  return (
    <CodeBlock>
      <CodeBlockActions>
        <CodeBlockCopyButton value={value} />
        {children}
      </CodeBlockActions>
      <CodeBlockContent wrap className={className}>
        {lines.map((line, index) => (
          <CodeBlockLine key={index}>{line}</CodeBlockLine>
        ))}
      </CodeBlockContent>
    </CodeBlock>
  );
}

export function CodeExpandButton({value, language, title}) {
  return (
    <Dialog>
      <DialogTrigger
        render={<IconButton variant="ghost" size="icon-xs" title="Tam ekran" />}
      >
        <Maximize2Icon />
      </DialogTrigger>
      <DialogContent position="top" size="full">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <CodeViewerBlock value={value} language={language} />
      </DialogContent>
    </Dialog>
  );
}

export function CodeViewer({value, language = 'text', title}) {
  return (
    <CodeViewerBlock value={value} language={language} className="max-h-64">
      <CodeExpandButton value={value} language={language} title={title} />
    </CodeViewerBlock>
  );
}
