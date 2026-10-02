import { createContext, type ReactNode, useContext, useMemo } from 'react';
import { ToastProvider } from '@/components/Toast';
import { type Bridge, type Client, createClient } from './client';
import type { Platform } from './platform';

const ClientContext = createContext<Client | null>(null);
const PlatformContext = createContext<Platform | null>(null);

/**
 * Everything a screen needs around it: the mesa client over `bridge`, the OS `platform`, and the
 * toasts. main.tsx passes the real bridge and platform; tests pass fakes.
 */
export function MesaRoot(props: { bridge: Bridge; platform: Platform; children: ReactNode }) {
  const client = useMemo(() => createClient(props.bridge), [props.bridge]);
  return (
    <ClientContext value={client}>
      <PlatformContext value={props.platform}>
        <ToastProvider>{props.children}</ToastProvider>
      </PlatformContext>
    </ClientContext>
  );
}

function need<T>(value: T | null, name: string): T {
  if (!value) throw new Error(`${name} needs a MesaRoot above it`);
  return value;
}

export const useClient = (): Client => need(useContext(ClientContext), 'useClient');
export const usePlatform = (): Platform => need(useContext(PlatformContext), 'usePlatform');
