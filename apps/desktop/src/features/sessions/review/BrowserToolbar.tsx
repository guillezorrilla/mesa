import { ArrowLeft, ArrowRight, ExternalLink, RotateCcw, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/** The session browser's address bar: Back, Forward, the address, Reload, open outside, Close. */
export function BrowserToolbar(props: {
  address: string;
  /** The URL loaded; empty until a page loads. */
  current: string;
  busy: boolean;
  acting: boolean;
  onAddress: (address: string) => void;
  onNavigate: () => void;
  onBack: () => void;
  onForward: () => void;
  onReload: () => void;
  onOpenExternal: () => void;
  onClose: () => void;
}) {
  return (
    <form
      className="flex gap-1 border-b p-2"
      onSubmit={(event) => {
        event.preventDefault();
        props.onNavigate();
      }}
    >
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        disabled={!props.current}
        aria-label="Back"
        onClick={props.onBack}
      >
        <ArrowLeft aria-hidden />
      </Button>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        disabled={!props.current}
        aria-label="Forward"
        onClick={props.onForward}
      >
        <ArrowRight aria-hidden />
      </Button>
      <Input
        aria-label="Browser address"
        value={props.address}
        onChange={(event) => props.onAddress(event.target.value)}
        placeholder="https://example.com"
      />
      <Button type="submit" size="icon-sm" disabled={props.busy} aria-label="Go to address">
        <Search aria-hidden />
      </Button>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        disabled={!props.current || props.busy}
        aria-label="Reload page"
        onClick={props.onReload}
      >
        <RotateCcw aria-hidden />
      </Button>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        disabled={!props.current || props.acting}
        aria-label="Open in default browser"
        onClick={props.onOpenExternal}
      >
        <ExternalLink aria-hidden />
      </Button>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        aria-label="Close browser"
        onClick={props.onClose}
      >
        <X aria-hidden />
      </Button>
    </form>
  );
}
