import { ActionDialog } from '@/components/ActionDialog';

/** Asks before Mesa quits: agent sessions keep running after it closes. */
export function QuitDialog(props: { closing: boolean; onQuit: () => void; onCancel: () => void }) {
  return (
    <ActionDialog
      testId="quit-dialog"
      title="Quit Mesa?"
      description="Agent sessions keep running after the app closes."
      submit={{ label: 'Quit Mesa', testId: 'confirm-quit', disabled: props.closing }}
      onSubmit={props.onQuit}
      onCancel={props.onCancel}
    >
      <p className="text-sm">You can return to your sessions when you reopen Mesa.</p>
    </ActionDialog>
  );
}
