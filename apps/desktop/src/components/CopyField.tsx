import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { usePlatform } from '@/lib/MesaRoot';
import { cn } from '@/lib/utils';
import { CutStartText } from './CutStartText';
import { Button } from './ui/button';

/**
 * A value to paste elsewhere (a path, a command, a snippet) with Copy, on the app's pasteboard
 * (WKWebView refuses navigator.clipboard). `onCopied` runs on Copy and on a copy of the selected
 * text alike. A one-line value is cut at its start, so a path's file name shows.
 */
export function CopyField(props: {
  value?: string;
  testId?: string;
  multiline?: boolean;
  onCopied?: () => void;
}) {
  const { clipboard } = usePlatform();
  const [copied, setCopied] = useState(false);
  const { value } = props;
  return (
    <div className="flex min-w-0 items-start gap-1 rounded-md border bg-muted/40 py-1 pr-1 pl-2.5">
      {props.multiline ? (
        <pre
          data-testid={props.testId}
          onCopy={props.onCopied}
          // Wrapped, so a long line shows whole rather than cut at the right.
          className="min-w-0 flex-1 whitespace-pre-wrap break-all py-1 font-mono text-xs"
        >
          {value ?? '...'}
        </pre>
      ) : (
        <CutStartText
          text={value}
          testId={props.testId}
          onCopy={props.onCopied}
          className="self-center"
        />
      )}
      <Button
        size="sm"
        variant="ghost"
        className={cn(props.multiline && 'mt-0.5')}
        disabled={!value}
        onClick={() => {
          if (!value) return;
          props.onCopied?.();
          void clipboard.write(value).then(() => setCopied(true));
        }}
      >
        {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
        {copied ? 'Copied' : 'Copy'}
      </Button>
    </div>
  );
}
