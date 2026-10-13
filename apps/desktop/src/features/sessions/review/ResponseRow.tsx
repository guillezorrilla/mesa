import type { NativeResponse } from '@mesa/core';
import { Copy } from 'lucide-react';
import { type ReactNode, useEffect, useRef } from 'react';
import { IconButton } from '@/components/IconButton';
import { cn } from '@/lib/utils';

/**
 * One reply in the Replies list: its first two lines, which open it in place, Copy for the whole
 * reply, and each fenced block with its own Copy. Open, it shows `children` right under it,
 * scrolled into view.
 */
export function ResponseRow(props: {
  response: NativeResponse;
  open: boolean;
  onOpen: () => void;
  onCopy: (text: string, what: 'Reply' | 'Block') => void;
  children: ReactNode;
}) {
  const { response, open } = props;
  const row = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) row.current?.scrollIntoView?.({ block: 'nearest' });
  }, [open]);
  return (
    <div ref={row} className={cn('rounded border', open && 'border-ring')}>
      <div className="flex items-start gap-1 p-2">
        <button
          type="button"
          aria-expanded={open}
          className="min-w-0 flex-1 rounded-sm px-2 py-1 text-left whitespace-pre-line line-clamp-2 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
          onClick={props.onOpen}
        >
          {response.text.split('\n').slice(0, 2).join('\n')}
        </button>
        <IconButton
          label="Copy reply"
          icon={Copy}
          onClick={() => props.onCopy(response.text, 'Reply')}
        />
      </div>
      {response.blocks.map((block, index) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: a reply's blocks never reorder.
          key={index}
          className="mx-2 mb-2 flex items-start gap-1 rounded bg-muted p-2"
        >
          <pre className="max-h-32 min-w-0 flex-1 overflow-auto whitespace-pre-wrap break-words font-mono text-xs">
            {block}
          </pre>
          <IconButton
            label={`Copy block ${index + 1}`}
            icon={Copy}
            onClick={() => props.onCopy(block, 'Block')}
          />
        </div>
      ))}
      {open && <div className="border-t p-3">{props.children}</div>}
    </div>
  );
}
