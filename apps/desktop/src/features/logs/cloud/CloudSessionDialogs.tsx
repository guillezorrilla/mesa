import { GuardrailDialog } from '@/features/sessions/dialogs/GuardrailDialog';
import { CloudProjectDialog } from './CloudProjectDialog';
import { ProdAskDialog } from './ProdAskDialog';
import type { CloudSession } from './useCloudSession';

/** The questions before a session from Cloud Logs starts: which project, prod, and the guardrail. */
export function CloudSessionDialogs(props: { session: CloudSession }) {
  const { session } = props;
  const { picking, asking } = session;
  return (
    <>
      {picking && (
        <CloudProjectDialog
          title={'group' in picking ? 'Fix in which project?' : 'Open in which project?'}
          description={
            'group' in picking
              ? 'A session starts there with the error, its samples and its query as its goal.'
              : 'A session starts there with this conversation and its queries as its goal.'
          }
          remember={session.pickingRef}
          onCancel={session.cancel}
          onPick={(project, remember) => void session.pick(project, remember)}
        />
      )}
      {asking?.projects && (
        <ProdAskDialog
          projects={asking.projects}
          description={`The session's agent reads this error from ${asking.projects.join(', ')}, masked. This is asked once for each GCP project.`}
          label="Start the session"
          onConfirm={session.confirm}
          onCancel={session.dismiss}
        />
      )}
      {asking?.check && (
        <GuardrailDialog
          action="start"
          about="this session starts"
          check={asking.check}
          disabled={false}
          onConfirm={session.confirm}
          onCancel={session.dismiss}
        />
      )}
    </>
  );
}
