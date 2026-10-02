import type { Result, VaultStatus } from '@mesa/core';
import { FolderOpen, FolderX, LayoutGrid, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

type Failure = Extract<Result<unknown>, { ok: false }>['error'];

function Explained(props: {
  state: string;
  icon: ReactNode;
  title: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div
      data-testid="vault-state"
      data-state={props.state}
      className="flex min-h-72 flex-col items-center justify-center rounded-xl border border-dashed bg-card/40 px-6 py-10 text-center"
    >
      <span className="mb-5 flex size-14 items-center justify-center rounded-2xl border bg-background text-muted-foreground [&_svg]:size-6">
        {props.icon}
      </span>
      <h3 className="text-lg font-medium tracking-tight">{props.title}</h3>
      <div className="mt-2 max-w-md space-y-2 break-words text-sm text-muted-foreground">
        {props.children}
      </div>
      {props.actions && (
        <div className="mt-5 flex flex-wrap justify-center gap-2">{props.actions}</div>
      )}
    </div>
  );
}

/**
 * Why the vault did not list, and the fix: no folder at the profile's vault path (`not_found`,
 * with the path from `mesa vault status`), or any other failure, such as a path that is a file.
 */
export function VaultUnlisted({
  error,
  status,
  actions,
}: {
  error: Failure;
  status?: VaultStatus;
  actions?: ReactNode;
}) {
  if (error.code === 'not_found' && status) {
    return (
      <Explained
        state="missing"
        icon={<FolderX aria-hidden />}
        title="Choose a home for your knowledge"
        actions={actions}
      >
        <p>The vault folder at {status.path} could not be found.</p>
        <p>Create it here, or choose another folder in vault settings.</p>
      </Explained>
    );
  }
  return (
    <Explained
      state="unlisted"
      icon={<TriangleAlert aria-hidden />}
      title="The vault did not open"
      actions={actions}
    >
      <p>{error.message}</p>
      {error.code === 'invalid_config' && (
        <p>Choose a vault folder in Settings, under General &gt; Vault.</p>
      )}
    </Explained>
  );
}

/** A vault folder with nothing in it yet, and how to lay it out. */
export function VaultEmpty({ vault, actions }: { vault: string; actions?: ReactNode }) {
  return (
    <Explained
      state="empty"
      icon={<FolderOpen aria-hidden />}
      title="Your knowledge starts here"
      actions={actions}
    >
      <p>Notes, decisions, and session summaries will collect here as you work.</p>
      <p className="break-all font-mono text-xs">{vault}</p>
    </Explained>
  );
}

/** A vault without all of Mesa's layout: what it lacks, and that init adds only that. */
export function VaultNotLaidOut({ status, actions }: { status: VaultStatus; actions?: ReactNode }) {
  return (
    <Alert data-testid="vault-state" data-state="not-laid-out">
      <LayoutGrid aria-hidden />
      <AlertTitle>Set up your vault</AlertTitle>
      <AlertDescription>
        <p>
          Add Mesa's missing folders and notes: {status.missing.join(', ')}. Your existing files are
          kept.
        </p>
        {actions}
      </AlertDescription>
    </Alert>
  );
}
