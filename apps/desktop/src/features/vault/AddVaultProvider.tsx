import { type ReactNode, useState } from 'react';
import { AddVaultDialog } from './AddVaultDialog';
import { AddVaultContext, type AddVaultRequest } from './useOpenInObsidian';

/** Holds the add-vault guide every Open in Obsidian below it shows on a vault Obsidian does not know. */
export function AddVaultProvider(props: { children: ReactNode }) {
  const [request, setRequest] = useState<AddVaultRequest>();
  return (
    <AddVaultContext value={setRequest}>
      {props.children}
      {request && (
        <AddVaultDialog
          key={request.details.vault}
          request={request}
          onClose={() => setRequest(undefined)}
        />
      )}
    </AddVaultContext>
  );
}
