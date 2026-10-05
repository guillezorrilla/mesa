import { Trash2 } from 'lucide-react';
import { ActionDialog } from '@/components/ActionDialog';
import { useAct } from '@/lib/useAct';
import { useRun } from '@/lib/useCommand';

/** Confirms clearing the whole notification center, then clears it in one call. */
export function ClearNotificationsDialog(props: {
  count: number;
  unread: number;
  onCleared: () => void;
  onCancel: () => void;
}) {
  const run = useRun();
  const { acting, act } = useAct();
  return (
    <ActionDialog
      testId="clear-notifications-dialog"
      title="Clear notification center?"
      description="Every notice leaves the bell, and this cannot be undone. New notices still arrive."
      submit={{
        label: (
          <>
            <Trash2 aria-hidden />
            Clear all
          </>
        ),
        testId: 'confirm-clear-notifications',
        disabled: acting,
        variant: 'destructive',
      }}
      onSubmit={() =>
        void act(async () => {
          const result = await run('notifications.clearAll');
          if (!result) return undefined;
          props.onCleared();
          return undefined;
        })
      }
      onCancel={props.onCancel}
    >
      <p className="text-sm">
        {props.count} notices, {props.unread} unread
      </p>
    </ActionDialog>
  );
}
