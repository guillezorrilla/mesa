import { MousePointer2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** The loaded page's URL with Inspect page, Pick element, and, while picking, Use selection. */
export function BrowserPageBar(props: {
  current: string;
  picking: boolean;
  onInspect: () => void;
  onPick: () => void;
  onUseSelection: () => void;
}) {
  return (
    <div className="flex items-center gap-2 border-b px-2 py-1 text-xs">
      <span className="min-w-0 flex-1 truncate">{props.current}</span>
      <Button size="xs" variant="outline" onClick={props.onInspect}>
        Inspect page
      </Button>
      <Button size="xs" variant="outline" onClick={props.onPick}>
        <MousePointer2 aria-hidden /> Pick element
      </Button>
      {props.picking && (
        <Button size="xs" variant="outline" onClick={props.onUseSelection}>
          Use selection
        </Button>
      )}
    </div>
  );
}
