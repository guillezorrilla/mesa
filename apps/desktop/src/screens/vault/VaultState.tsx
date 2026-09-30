import type { Result, VaultStatus } from '@mesa/core';
import { FolderOpen, FolderX, LayoutGrid, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

type Failure = Extract<Result<unknown>, { ok: false }>['error'];

const INIT = 'mesa vault init';
const SET = 'mesa config set vault <path>';

function Explained(props: { state: string; icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <Alert data-testid="vault-state" data-state={props.state}>
      {props.icon}
      <AlertTitle>{props.title}</AlertTitle>
      <AlertDescription>{props.children}</AlertDescription>
    </Alert>
  );
}

const Command = ({ children }: { children: string }) => (
  <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">{children}</code>
);

/**
 * Why the vault did not list, and the fix: no folder at the profile's vault path (`not_found`,
 * with the path from `mesa vault status`), or any other failure, such as a path that is a file.
 */
export function VaultUnlisted({ error, status }: { error: Failure; status?: VaultStatus }) {
  if (error.code === 'not_found' && status) {
    return (
      <Explained state="missing" icon={<FolderX aria-hidden />} title="No vault folder">
        <p>This profile's vault is {status.path}, and no folder is there.</p>
        <p>
          Run <Command>{INIT}</Command> to create it with Mesa's layout, or point the profile at
          your vault with <Command>{SET}</Command>.
        </p>
      </Explained>
    );
  }
  return (
    <Explained state="unlisted" icon={<TriangleAlert aria-hidden />} title="The vault did not open">
      <p>{error.message}.</p>
      {error.code === 'invalid_config' && (
        <p>
          Point the profile at a vault folder with <Command>{SET}</Command>.
        </p>
      )}
    </Explained>
  );
}

/** A vault folder with nothing in it yet, and how to lay it out. */
export function VaultEmpty({ vault }: { vault: string }) {
  return (
    <Explained state="empty" icon={<FolderOpen aria-hidden />} title="The vault is empty">
      <p>{vault} has no notes or files yet.</p>
      <p>
        Run <Command>{INIT}</Command> to lay it out; notes you and your sessions save then show
        here.
      </p>
    </Explained>
  );
}

/** A vault without all of Mesa's layout: what it lacks, and that init adds only that. */
export function VaultNotLaidOut({ status }: { status: VaultStatus }) {
  return (
    <Explained state="not-laid-out" icon={<LayoutGrid aria-hidden />} title="Not laid out">
      <p>This vault has no {status.missing.join(', ')}.</p>
      <p>
        Run <Command>{INIT}</Command> to add them; it creates only what is missing.
      </p>
    </Explained>
  );
}
