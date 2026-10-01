import { Folder } from 'lucide-react';
import { useCheckoutPaths } from '@/lib/useCheckoutPaths';
import { cn } from '@/lib/utils';

/** A folder icon over a native select of the project's checkouts; '' is the main checkout. */
export function CheckoutPicker(props: {
  project: string;
  value: string;
  label: string;
  onChange: (path: string) => void;
}) {
  const paths = useCheckoutPaths(props.project);
  return (
    <span
      className={cn(
        'relative flex size-8 items-center justify-center rounded-md hover:bg-accent focus-within:outline-2 focus-within:outline-ring',
        props.value ? 'text-state-working' : 'text-muted-foreground hover:text-foreground',
      )}
      title={props.value || 'Main checkout'}
    >
      <Folder aria-hidden className="size-4" />
      {/* ponytail: the OS menu of a transparent native select, no custom dropdown. */}
      <select
        aria-label={props.label}
        className="absolute inset-0 cursor-pointer opacity-0"
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      >
        <option value="">Main checkout</option>
        {paths.map((path) => (
          <option key={path} value={path}>
            {path}
          </option>
        ))}
      </select>
    </span>
  );
}
