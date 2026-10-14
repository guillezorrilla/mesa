import type { Result, UnknownVault } from '@mesa/core';
import { createContext, useContext, useMemo } from 'react';
import { useToast } from '@/components/Toast';
import { useCall } from '@/lib/useCommand';

/** A vault Obsidian does not know, and the open that failed on it, to retry once it is added. */
export type AddVaultRequest = {
  details: UnknownVault;
  retry: () => Promise<Result<unknown>>;
};

/**
 * Shows the add-vault guide. The app provides it; a screen rendered on its own has none, so an
 * unknown vault toasts there as any other failure does.
 */
export const AddVaultContext = createContext<((request: AddVaultRequest) => void) | undefined>(
  undefined,
);

/** The details of the not_found `vault open` fails with when Obsidian does not know the vault. */
export const unknownVault = (error: { details?: unknown }) =>
  (error.details as Partial<UnknownVault> | undefined)?.unknownVault === true
    ? (error.details as UnknownVault)
    : undefined;

/**
 * Opens the vault, or one note in it, in Obsidian, as every Open in Obsidian does. Resolves with
 * the command's data, or undefined after a failure: a vault Obsidian does not know opens the
 * add-vault guide, anything else toasts.
 */
export function useOpenInObsidian() {
  const call = useCall();
  const toast = useToast();
  const guide = useContext(AddVaultContext);
  return useMemo(() => {
    const settle = async <T>(open: () => Promise<Result<T>>): Promise<T | undefined> => {
      const result = await open();
      if (result.ok) return result.data;
      const details = unknownVault(result.error);
      if (details && guide) return void guide({ details, retry: open });
      toast(result.error.message);
    };
    return {
      openVault: () => settle(() => call('vault.open')),
      openNote: (note: string) => settle(() => call('vault.openNote', { note })),
    };
  }, [call, toast, guide]);
}
