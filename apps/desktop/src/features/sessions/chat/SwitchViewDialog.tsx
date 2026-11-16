import { ActionDialog } from '@/components/ActionDialog';
import type { ShownView } from './useSessionView';

/** Asks before a view switch cuts the agent's turn: Interrupt and switch, or Cancel. */
export function SwitchViewDialog(props: {
  to: ShownView;
  disabled: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <ActionDialog
      testId="switch-view-dialog"
      title={`Switch to ${props.to === 'chat' ? 'Chat (beta)' : 'Terminal'}?`}
      description="The agent is working. Wait for it to finish, or interrupt and switch."
      submit={{
        label: 'Interrupt and switch',
        testId: 'switch-view-interrupt',
        disabled: props.disabled,
        variant: 'destructive',
      }}
      onSubmit={props.onConfirm}
      onCancel={props.onCancel}
    />
  );
}
