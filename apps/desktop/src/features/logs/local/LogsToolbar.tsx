import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { IconButton } from '@/components/IconButton';

/**
 * The Logs panel's one header row: the source, the filters, then on the right the layout buttons,
 * the menu and Close. It wraps when the panel is narrow.
 */
export function LogsToolbar(props: {
  source: ReactNode;
  filters: ReactNode;
  layout: ReactNode;
  menu: ReactNode;
  onClose: () => void;
}) {
  return (
    <header className="flex shrink-0 flex-wrap items-center gap-1.5 border-b bg-card px-2 py-1.5">
      {props.source}
      {props.filters}
      <div className="ml-auto flex items-center">
        {props.layout}
        {props.menu}
        <IconButton label="Close logs" icon={X} onClick={props.onClose} />
      </div>
    </header>
  );
}
