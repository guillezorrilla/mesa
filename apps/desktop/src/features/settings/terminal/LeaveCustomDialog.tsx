import { ActionDialog } from '@/components/ActionDialog';

/** Asks before a palette replaces the custom colors, which are not kept. */
export function LeaveCustomDialog(props: {
  /** The palette's name. */
  palette: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <ActionDialog
      testId="terminal-palette-confirm"
      title="Leave your custom palette?"
      description={`Session terminals switch to ${props.palette}. Your custom colors are not kept: editing a color later starts a new custom palette from ${props.palette}.`}
      submit={{
        label: `Use ${props.palette}`,
        testId: 'terminal-palette-confirm-submit',
        disabled: false,
      }}
      onSubmit={props.onConfirm}
      onCancel={props.onCancel}
    />
  );
}
