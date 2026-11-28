import { EyeOff, MoreHorizontal, Plus, RefreshCw, X } from 'lucide-react';
import { IconButton } from '@/components/IconButton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/**
 * The Logs panel's menu: look for sources again, Add a log source, mute lines holding the filter
 * text, the muted patterns (each one unmuted on a click), and Hide Logs for this project.
 */
export function LogsMenu(props: {
  filter: string;
  mutes: readonly string[];
  onRefresh: () => void;
  onAddSource: () => void;
  onMute: (pattern: string) => void;
  onUnmute: (pattern: string) => void;
  onHide: () => void;
}) {
  const filter = props.filter.trim();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton label="Logs menu" icon={MoreHorizontal} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-w-80">
        <DropdownMenuItem onSelect={props.onRefresh}>
          <RefreshCw aria-hidden /> Look for sources again
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={props.onAddSource}>
          <Plus aria-hidden /> Add a log source
        </DropdownMenuItem>
        {filter && (
          <DropdownMenuItem onSelect={() => props.onMute(filter)}>
            <EyeOff aria-hidden />
            <span className="truncate">Mute lines with "{filter}"</span>
          </DropdownMenuItem>
        )}
        {props.mutes.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Muted in this project
            </DropdownMenuLabel>
            {props.mutes.map((mute) => (
              <DropdownMenuItem
                key={mute}
                aria-label={`Unmute ${mute}`}
                onSelect={() => props.onUnmute(mute)}
              >
                <span className="min-w-0 flex-1 truncate font-mono text-xs">{mute}</span>
                <X aria-hidden className="text-muted-foreground" />
              </DropdownMenuItem>
            ))}
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={props.onHide}>
          <EyeOff aria-hidden /> Hide Logs for this project
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
