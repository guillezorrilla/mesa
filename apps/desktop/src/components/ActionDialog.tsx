import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';

/**
 * The frame every Board dialog shares: modal (Escape or a click outside cancels), a title and a
 * description, the dialog's own fields, and a footer with Cancel and its submit, which is
 * disabled while an action runs or the fields are not ready. It is one form, so Enter in a text
 * field submits and `onSubmit` reads the fields from it. It fits the window: fields too tall for it
 * scroll between the title and the buttons.
 */
export function ActionDialog(props: {
  testId: string;
  title: ReactNode;
  description: ReactNode;
  wide?: boolean;
  submit: {
    label: ReactNode;
    testId: string;
    disabled: boolean;
    variant?: 'default' | 'destructive';
  };
  onSubmit: (form: HTMLFormElement) => void;
  onCancel: () => void;
  returnFocus?: HTMLElement | null;
  children?: ReactNode;
}) {
  const { submit } = props;
  return (
    <Dialog open onOpenChange={(open) => !open && props.onCancel()}>
      <DialogContent
        data-testid={props.testId}
        className={cn(
          'max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)]',
          props.wide ? 'sm:max-w-lg' : 'sm:max-w-md',
        )}
        onCloseAutoFocus={
          props.returnFocus
            ? (event) => {
                event.preventDefault();
                props.returnFocus?.focus();
              }
            : undefined
        }
      >
        <DialogHeader>
          <DialogTitle>{props.title}</DialogTitle>
          <DialogDescription>{props.description}</DialogDescription>
        </DialogHeader>
        <form
          className="grid min-h-0 grid-rows-[minmax(0,1fr)_auto] gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            props.onSubmit(e.currentTarget);
          }}
        >
          {/* Taller fields scroll here, so the title and the buttons stay in the window. */}
          <div className="-mx-6 -my-1 grid min-h-0 content-start gap-4 overflow-y-auto px-6 py-1">
            {props.children}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={props.onCancel}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant={submit.variant ?? 'default'}
              data-testid={submit.testId}
              disabled={submit.disabled}
            >
              {submit.label}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
