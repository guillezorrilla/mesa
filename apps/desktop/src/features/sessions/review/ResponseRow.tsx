import type { NativeResponse } from '@mesa/core';
import { Copy } from 'lucide-react';
import { type ReactNode, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * One native response in the Responses list: its first two lines, which open it in place, and
 * Copy. Open, it shows `children` (its review) right under it, scrolled into view.
 */
export function ResponseRow(props: {
  response: NativeResponse;
  open: boolean;
  onOpen: () => void;
  onCopy: () => void;
  children: ReactNode;
}) {
  const { response, open } = props;
  const row = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) row.current?.scrollIntoView?.({ block: 'nearest' });
  }, [open]);
  return (
    <div ref={row} className={cn('group rounded border', open && 'border-ring')}>
      <div className="flex items-start gap-1 p-2">
        <button
          type="button"
          aria-expanded={open}
          className="min-w-0 flex-1 rounded-sm px-2 py-1 text-left whitespace-pre-line line-clamp-2 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
          onClick={props.onOpen}
        >
          {response.text.split('\n').slice(0, 2).join('\n')}
        </button>
        <Button
          size="icon-sm"
          variant="ghost"
          className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
          aria-label="Copy response"
          onClick={props.onCopy}
        >
          <Copy aria-hidden />
        </Button>
      </div>
      {open && <div className="border-t p-3">{props.children}</div>}
    </div>
  );
}
