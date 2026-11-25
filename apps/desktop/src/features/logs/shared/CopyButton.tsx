import type { CopyFormat } from '@mesa/core';
import { Copy } from 'lucide-react';
import type { ReactNode } from 'react';
import { SplitButton } from '@/components/SplitButton';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';

/**
 * Copy as a split button: a click copies the entries ready to paste (copyText's `paste`); its
 * menu copies the message only, as JSON or as Markdown, then any `extra` items (a group's
 * summary, a Cloud Console link). `label` shows beside the icon; none keeps it an icon.
 */
export function CopyButton(props: {
  onCopy: (format: CopyFormat) => void;
  label?: string;
  size?: 'xs' | 'sm';
  extra?: ReactNode;
}) {
  return (
    <SplitButton
      size={props.size ?? 'xs'}
      variant="outline"
      menuLabel="More ways to copy"
      onClick={() => props.onCopy('paste')}
      menu={
        <>
          <DropdownMenuItem onSelect={() => props.onCopy('message')}>Message only</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => props.onCopy('json')}>As JSON</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => props.onCopy('markdown')}>As Markdown</DropdownMenuItem>
          {props.extra}
        </>
      }
    >
      <Copy aria-hidden />
      {props.label ?? <span className="sr-only">Copy</span>}
    </SplitButton>
  );
}
