import { Check } from 'lucide-react';
import { DropdownMenu as Primitive } from 'radix-ui';
import type * as React from 'react';
import { cn } from '@/lib/utils';

export function DropdownMenu(props: React.ComponentProps<typeof Primitive.Root>) {
  return <Primitive.Root data-slot="dropdown-menu" {...props} />;
}

export function DropdownMenuTrigger(props: React.ComponentProps<typeof Primitive.Trigger>) {
  return <Primitive.Trigger data-slot="dropdown-menu-trigger" {...props} />;
}

export function DropdownMenuContent({
  className,
  ...props
}: React.ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Portal>
      <Primitive.Content
        data-slot="dropdown-menu-content"
        sideOffset={4}
        className={cn(
          'z-50 min-w-40 rounded-md border bg-popover p-1 text-popover-foreground shadow-lg',
          className,
        )}
        {...props}
      />
    </Primitive.Portal>
  );
}

export function DropdownMenuItem({
  className,
  ...props
}: React.ComponentProps<typeof Primitive.Item>) {
  return (
    <Primitive.Item
      data-slot="dropdown-menu-item"
      className={cn(
        'flex items-center gap-2 rounded px-2 py-1.5 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuCheckboxItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof Primitive.CheckboxItem>) {
  return (
    <Primitive.CheckboxItem
      data-slot="dropdown-menu-checkbox-item"
      className={cn(
        'relative flex items-center gap-2 rounded py-1.5 pr-2 pl-8 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50',
        className,
      )}
      {...props}
    >
      <span className="absolute left-2 flex size-4 items-center justify-center">
        <Primitive.ItemIndicator>
          <Check aria-hidden className="size-4" />
        </Primitive.ItemIndicator>
      </span>
      {children}
    </Primitive.CheckboxItem>
  );
}

export function DropdownMenuLabel({
  className,
  ...props
}: React.ComponentProps<typeof Primitive.Label>) {
  return (
    <Primitive.Label
      className={cn('px-2 py-1 text-xs text-muted-foreground', className)}
      {...props}
    />
  );
}

export function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof Primitive.Separator>) {
  return <Primitive.Separator className={cn('-mx-1 my-1 h-px bg-border', className)} {...props} />;
}
