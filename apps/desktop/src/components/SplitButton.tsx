import { ChevronDown } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { Button } from './ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from './ui/dropdown-menu';

/** A button that does the usual thing, joined to a chevron whose menu (`menu`) holds the rest. */
export function SplitButton(props: {
  children: ReactNode;
  onClick: () => void;
  /** Names the chevron for readers. */
  menuLabel: string;
  menu: ReactNode;
  size?: ComponentProps<typeof Button>['size'];
  variant?: 'default' | 'outline';
  disabled?: boolean;
  testId?: string;
  menuTestId?: string;
}) {
  const { size = 'sm', variant = 'default' } = props;
  return (
    <div className="flex">
      <Button
        size={size}
        variant={variant}
        className="rounded-r-none"
        disabled={props.disabled}
        data-testid={props.testId}
        onClick={props.onClick}
      >
        {props.children}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size={size}
            variant={variant}
            aria-label={props.menuLabel}
            data-testid={props.menuTestId}
            disabled={props.disabled}
            className={
              variant === 'outline'
                ? 'rounded-l-none border-l-0 px-1'
                : 'rounded-l-none border-l border-l-primary-foreground/20 px-2'
            }
          >
            <ChevronDown aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">{props.menu}</DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
