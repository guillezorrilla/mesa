import { ExternalLink } from 'lucide-react';
import type { ReactNode } from 'react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Opens Mesa's GitHub App installation page in the browser, where the person picks the orgs and
 * repos Mesa may read; `onOpen` as it opens. A text link, or an outlined button.
 */
export function GiveAccessLink(props: {
  href: string | undefined;
  onOpen: () => void;
  button?: boolean;
  children: ReactNode;
}) {
  return (
    <a
      href={props.href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={props.onOpen}
      aria-disabled={!props.href || undefined}
      className={cn(
        props.button
          ? buttonVariants({ variant: 'outline', size: 'sm' })
          : 'inline-flex items-center gap-1 text-foreground underline underline-offset-3 hover:text-primary',
        !props.href && 'pointer-events-none opacity-50',
      )}
    >
      {props.children}
      {props.button && <ExternalLink aria-hidden className="size-3.5" />}
    </a>
  );
}
