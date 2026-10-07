import type { KeyRow } from '@mesa/core';
import type { SystemOneProvider } from '@mesa/core/browser';
import { ChevronRight, MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SettingRow } from '../SettingRow';
import { MODELS } from './models';
import { SiteResultsList } from './SiteResultsList';

/** What the row says about its model: in use, connected, or not, with its cost. */
const statusOf = (model: SystemOneProvider, row: KeyRow | undefined, inUse: boolean) => {
  const { secret, cost } = MODELS[model];
  if (!row?.set) return `Not connected · ${cost}`;
  return `${inUse ? 'In use' : 'Connected'} · ${secret} ending ${row.last4}`;
};

/**
 * One hosted model, as Connections lists a source: its name and status, and one action: Connect,
 * or Use once connected; Replace, Disconnect and Stop using wait in its menu. How it performed
 * at each decision site folds under it.
 */
export function DecisionModelRow(props: {
  model: SystemOneProvider;
  row: KeyRow | undefined;
  inUse: boolean;
  /** The person's opt-in to experimental automatic decisions (`decisions.experimental`). */
  experimental: boolean;
  acting: boolean;
  onConnect: () => void;
  onUse: (use: boolean) => void;
  onDisconnect: () => void;
}) {
  const { label, maker, icon, provider, secret } = MODELS[props.model];
  const connected = props.row?.set === true;
  return (
    <SettingRow
      icon={icon}
      title={`${label} (${maker})`}
      description={statusOf(props.model, props.row, props.inUse)}
      keywords={`${provider} ${secret} api key token connect decision model`}
      control={
        <span className="flex items-center gap-1">
          {!connected ? (
            <Button size="sm" variant="secondary" disabled={props.acting} onClick={props.onConnect}>
              Connect
            </Button>
          ) : (
            !props.inUse && (
              <Button
                size="sm"
                variant="secondary"
                disabled={props.acting}
                onClick={() => props.onUse(true)}
              >
                Use
              </Button>
            )
          )}
          {connected && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`${label} actions`}
                  title={`${label} actions`}
                  disabled={props.acting}
                >
                  <MoreHorizontal aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={props.onConnect}>Replace {secret}</DropdownMenuItem>
                {props.inUse && (
                  <DropdownMenuItem onSelect={() => props.onUse(false)}>
                    Stop using
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onSelect={props.onDisconnect}>Disconnect</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </span>
      }
    >
      <details className="group pl-7 text-xs text-muted-foreground">
        <summary className="flex w-fit cursor-pointer list-none items-center gap-1 select-none hover:text-foreground [&::-webkit-details-marker]:hidden">
          <ChevronRight aria-hidden className="size-3 transition-transform group-open:rotate-90" />
          How it performed
        </summary>
        <div className="mt-2 border-l pl-3">
          <SiteResultsList model={props.model} experimental={props.experimental} />
        </div>
      </details>
    </SettingRow>
  );
}
