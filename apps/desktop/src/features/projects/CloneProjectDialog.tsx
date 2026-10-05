import { repositoryUrl } from '@mesa/core/browser';
import { useState } from 'react';
import { ActionDialog } from '@/components/ActionDialog';
import { warningOf } from '@/components/Toast';
import { Input } from '@/components/ui/input';
import { useAct } from '@/lib/useAct';
import { useRun } from '@/lib/useCommand';

/** Native project links keep their explicit checkout confirmation without a Projects overview. */
export function CloneProjectDialog(props: {
  url: string;
  onCancel: () => void;
  onCloned: (name: string) => Promise<void>;
}) {
  const [url, setUrl] = useState(props.url);
  const run = useRun();
  const { acting, act } = useAct();
  let valid = false;
  try {
    repositoryUrl(url);
    valid = true;
  } catch {
    /* Core validates again before git runs. */
  }
  return (
    <ActionDialog
      testId="clone-project-dialog"
      title="Clone project"
      description="Clone this repository locally and add it to the sidebar."
      submit={{ label: 'Clone and register', testId: 'clone-project', disabled: !valid || acting }}
      onCancel={() => !acting && props.onCancel()}
      onSubmit={() => {
        if (!valid || acting) return;
        void act(async () => {
          const cloned = await run('projects.clone', { url: url.trim() });
          if (!cloned) return undefined;
          await props.onCloned(cloned.name);
          props.onCancel();
          return warningOf(cloned);
        });
      }}
    >
      <Input
        data-testid="repository-url"
        aria-label="Repository URL or Mesa project link"
        value={url}
        disabled={acting}
        onInput={(event) => setUrl(event.currentTarget.value)}
      />
    </ActionDialog>
  );
}
