import type { Agent, ManagedRow } from '@mesa/core';
import { AGENT_NAMES } from '@mesa/core/browser';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useCommand } from '@/lib/useCommand';

/**
 * The session header's agent, as Xirp's coding agent menu: the current agent first, then "Swap
 * to" each other installed one, which swaps a fresh session in place and hands off one with a
 * conversation (CONTEXT.md, Swap). An agent not installed is shown, disabled. Busy while the
 * session works, as a swap waits for it to be idle.
 */
export function AgentSwitcher(props: {
  row: ManagedRow;
  disabled: boolean;
  onSwap: (agent: Agent) => void;
  onHandoff: (agent: Agent) => void;
}) {
  const { row } = props;
  const agents = useCommand('agents.list');
  const working = row.lastState.state === 'working';
  const label = working ? 'Swap coding agent once the session is idle' : 'Swap coding agent';
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          data-testid="agent-switcher"
          aria-label={label}
          title={label}
          disabled={props.disabled || working || !row.alive}
        >
          {row.agent} <ChevronDown aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem disabled className="text-xs opacity-100">
          {row.agent} <span className="text-muted-foreground">(current)</span>
        </DropdownMenuItem>
        {AGENT_NAMES.filter((agent) => agent !== row.agent).map((agent) =>
          !agents.data?.[agent]?.installed ? (
            <DropdownMenuItem key={agent} disabled className="text-xs">
              {agent}{' '}
              <span className="ml-auto text-muted-foreground">
                {agents.data ? 'Not installed' : agents.error ? 'Unknown' : 'Checking'}
              </span>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              key={agent}
              className="text-xs"
              onSelect={() => (row.conversation ? props.onHandoff(agent) : props.onSwap(agent))}
            >
              Swap to {agent}
            </DropdownMenuItem>
          ),
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
