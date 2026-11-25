import type { GcpLogs } from '@mesa/core';
import { ActionDialog } from '@/components/ActionDialog';
import { CloudEnvPicker } from './CloudEnvPicker';
import { useCloudLogsConfig } from './useCloudLogsConfig';
import { useEnvRows } from './useEnvRows';

/**
 * The Logs menu's Edit envs (CONTEXT.md, Cloud Logs): the kept envs and the suggestions for the
 * projects read (useEnvRows); Save writes the envs and keeps the projects.
 */
export function CloudEnvsDialog(props: {
  gcp: GcpLogs;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const { rows, setRows, suggested, envs } = useEnvRows(props.gcp.projects, props.gcp.envs);
  const { setup } = useCloudLogsConfig();
  const count = Object.keys(envs).length;
  return (
    <ActionDialog
      testId="cloud-envs-dialog"
      title="Envs"
      description="Each env is a Logging filter applied in every project; rows of one name join."
      wide
      submit={{
        label: `Save ${count} ${count === 1 ? 'env' : 'envs'}`,
        testId: 'save-cloud-envs',
        disabled: false,
      }}
      onSubmit={async () => {
        if (await setup(props.gcp.projects, envs)) props.onSaved();
      }}
      onCancel={props.onCancel}
    >
      <CloudEnvPicker
        rows={rows}
        busy={suggested.busy}
        error={suggested.error && !suggested.busy ? suggested.error.message : undefined}
        onRetry={() => void suggested.refresh()}
        onRows={setRows}
      />
    </ActionDialog>
  );
}
