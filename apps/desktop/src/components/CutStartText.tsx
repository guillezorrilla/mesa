import { cn } from '@/lib/utils';

/**
 * One line of text cut at its start when it does not fit, so a path's file name stays in view:
 * laid out right to left, the text itself isolated left to right.
 */
export function CutStartText(props: {
  text?: string;
  className?: string;
  testId?: string;
  onCopy?: () => void;
}) {
  return (
    <code
      data-testid={props.testId}
      onCopy={props.onCopy}
      dir="rtl"
      title={props.text}
      className={cn('min-w-0 flex-1 truncate text-left font-mono text-xs', props.className)}
    >
      <bdi dir="ltr">{props.text ?? '...'}</bdi>
    </code>
  );
}
