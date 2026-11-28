import { ActionDialog } from '@/components/ActionDialog';

/** The first Ask on prod for some GCP projects: what is sent to the model, confirmed once. */
export function ProdAskDialog(props: {
  projects: string[];
  /** What reads the entries, when it is not Ask. */
  description?: string;
  label?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <ActionDialog
      testId="prod-ask-dialog"
      title="Send prod entries to the model?"
      description={
        props.description ??
        `Ask reads entries from ${props.projects.join(', ')} and sends them, masked, to the model. This is asked once for each GCP project.`
      }
      submit={{ label: props.label ?? 'Send and ask', testId: 'confirm-prod-ask', disabled: false }}
      onSubmit={props.onConfirm}
      onCancel={props.onCancel}
    />
  );
}
