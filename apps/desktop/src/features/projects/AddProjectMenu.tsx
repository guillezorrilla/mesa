import { FolderPlus, FolderSearch, History } from 'lucide-react';
import { type ReactNode, useRef } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export type ProjectAddRequest = {
  kind: 'local' | 'import' | 'discover';
  returnFocus: HTMLElement | null;
};

export function AddProjectMenu(props: {
  children: ReactNode;
  onSelect: (request: ProjectAddRequest) => void;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger ref={trigger} asChild>
        {props.children}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuItem
          onSelect={() => props.onSelect({ kind: 'local', returnFocus: trigger.current })}
        >
          <FolderPlus aria-hidden /> Add project
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => props.onSelect({ kind: 'import', returnFocus: trigger.current })}
        >
          <FolderSearch aria-hidden /> Import workspace
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => props.onSelect({ kind: 'discover', returnFocus: trigger.current })}
        >
          <History aria-hidden /> Find from sessions
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
