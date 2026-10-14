import { ExternalLink } from 'lucide-react';
import { useState } from 'react';
import { ActionDialog } from '@/components/ActionDialog';
import { Kbd } from '@/components/Kbd';
import { Muted } from '@/components/Muted';
import { useToast } from '@/components/Toast';
import { Button } from '@/components/ui/button';
import { InstallButton } from '@/features/doctor/InstallButton';
import { usePlatform } from '@/lib/MesaRoot';
import { useAct } from '@/lib/useAct';
import { useRun } from '@/lib/useCommand';
import { type AddVaultRequest, unknownVault } from './useOpenInObsidian';

/**
 * Walks the person through Obsidian's "Open folder as vault": Mesa copies the path and opens the
 * vault manager, but never writes Obsidian's own vault list. Done retries the open that failed.
 * Without Obsidian it offers to install it first.
 */
export function AddVaultDialog(props: { request: AddVaultRequest; onClose: () => void }) {
  const { details, retry } = props.request;
  const { clipboard } = usePlatform();
  const run = useRun();
  const toast = useToast();
  const { acting, act } = useAct();
  const [installed, setInstalled] = useState(details.installed);
  const [stillUnknown, setStillUnknown] = useState(false);
  const copyAndOpen = () =>
    act(async () => {
      await clipboard.write(details.vault);
      await run('obsidian.manager');
      return undefined;
    });
  const done = () =>
    act(async () => {
      const result = await retry();
      if (!result.ok && unknownVault(result.error)) return void setStillUnknown(true);
      props.onClose();
      if (!result.ok) toast(result.error.message);
      return undefined;
    });
  return (
    <ActionDialog
      testId="add-vault-dialog"
      title="Add your vault to Obsidian"
      description="Obsidian opens a vault once you add it. This is a one-time step."
      submit={{ label: 'Done, open it', testId: 'add-vault-retry', disabled: acting || !installed }}
      onSubmit={() => void done()}
      onCancel={props.onClose}
    >
      <code
        data-testid="add-vault-path"
        className="block break-all rounded-md bg-muted px-3 py-2 font-mono text-xs"
      >
        {details.vault}
      </code>
      {installed ? (
        <>
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            <li>In Obsidian, choose Open folder as vault.</li>
            <li>
              Press <Kbd>⌘⇧G</Kbd> and paste the path.
            </li>
            <li>Click Open, then come back and choose Done.</li>
          </ol>
          <Button
            type="button"
            variant="secondary"
            data-testid="add-vault-open-manager"
            disabled={acting}
            onClick={() => void copyAndOpen()}
          >
            <ExternalLink aria-hidden /> Copy path and open Obsidian
          </Button>
        </>
      ) : (
        <div className="space-y-2">
          <Muted>Obsidian is not installed. Install it, then add the vault.</Muted>
          <InstallButton name="obsidian" onInstalled={async () => setInstalled(true)} />
        </div>
      )}
      {stillUnknown && (
        <p
          role="status"
          data-testid="add-vault-still-unknown"
          className="text-sm text-state-waiting"
        >
          Obsidian does not know this vault yet. Add it with the steps above, then choose Done.
        </p>
      )}
    </ActionDialog>
  );
}
