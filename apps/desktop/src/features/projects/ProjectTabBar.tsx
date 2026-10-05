import { useState } from 'react';
import { ActionDialog } from '@/components/ActionDialog';
import { CountPill } from '@/components/CountPill';
import type { ProjectTab } from './ProjectScreen';

/**
 * The project screen's tabs, with the Git tab's change count; leaving a tab with an unsaved
 * document asks to discard it first.
 */
export function ProjectTabBar(props: {
  project: string;
  tab: ProjectTab;
  gitChanges: number;
  filesDirty: boolean;
  onTab: (tab: ProjectTab) => void;
  /** The unsaved document was discarded to leave its tab. */
  onDiscard: () => void;
}) {
  const { tab } = props;
  const [pendingTab, setPendingTab] = useState<ProjectTab>();
  return (
    <>
      {pendingTab && (
        <ActionDialog
          testId="file-leave-dialog"
          title="Discard unsaved changes?"
          description="Save or discard the open document before leaving this tab."
          submit={{
            label: 'Discard changes',
            testId: 'confirm-file-leave',
            disabled: false,
            variant: 'destructive',
          }}
          onSubmit={() => {
            props.onDiscard();
            props.onTab(pendingTab);
            setPendingTab(undefined);
          }}
          onCancel={() => setPendingTab(undefined)}
        >
          <p className="text-sm">Unsaved edits will be lost.</p>
        </ActionDialog>
      )}
      <nav aria-label={`${props.project} tabs`} className="flex gap-4 border-b">
        {(
          [
            'overview',
            'vault',
            'import',
            'git',
            'files',
            'skills',
            'instructions',
            'automations',
          ] as const
        ).map((name) => (
          <button
            key={name}
            type="button"
            aria-current={tab === name ? 'page' : undefined}
            className="-mb-px border-b-2 border-transparent px-1 pb-2 text-sm capitalize text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring aria-[current=page]:border-state-working aria-[current=page]:text-foreground"
            onClick={() => {
              if (props.filesDirty && name !== tab) setPendingTab(name);
              else props.onTab(name);
            }}
          >
            {name === 'import' ? 'Context' : name}
            {name === 'git' && props.gitChanges > 0 && (
              <CountPill
                count={props.gitChanges}
                className="ml-1.5 inline-flex size-5 items-center justify-center bg-state-idle px-0 text-[11px] font-medium text-background"
              />
            )}
          </button>
        ))}
      </nav>
    </>
  );
}
